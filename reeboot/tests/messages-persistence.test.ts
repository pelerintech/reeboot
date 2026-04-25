/**
 * Tests for:
 * - tasks table origin_channel / origin_peer columns (Task 6)
 * - user message written to messages table after turn (Task 7)
 * - assistant message written to messages table on success (Task 8)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runResilienceMigration } from '../src/db/schema.js';
import { createContextsTable } from '../src/context.js';
import { Orchestrator } from '../src/orchestrator.js';
import { MessageBus, createIncomingMessage } from '../src/channels/interface.js';
import type { AgentRunner, RunnerEvent } from '../src/agent-runner/interface.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Mock runner ─────────────────────────────────────────────────────────────

function makeMockRunner(responseText = ''): AgentRunner {
  return {
    async prompt(_content: string, onEvent: (e: RunnerEvent) => void) {
      if (responseText) {
        onEvent({ type: 'text_delta', delta: responseText });
      }
      onEvent({ type: 'message_end', runId: 'r1', usage: { input: 0, output: 0 } });
    },
    abort() {},
    async dispose() {},
    async reload() {},
  };
}

function makeFailingRunner(): AgentRunner {
  return {
    async prompt() { throw new Error('provider error'); },
    abort() {},
    async dispose() {},
    async reload() {},
  };
}

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  // Create base tables needed by orchestrator
  createContextsTable(db);
  db.prepare(
    `INSERT OR IGNORE INTO contexts (id, name, model_provider, model_id) VALUES ('main', 'main', '', '')`
  ).run();
  return db;
}

function getTableColumns(db: Database.Database, table: string): string[] {
  return (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map((c) => c.name);
}

// ─── Orchestrator setup helper ───────────────────────────────────────────────────

function makeOrchestratorWithRunner(runner: AgentRunner) {
  const db = makeDb();

  // Create messages table
  db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY DEFAULT (hex(randomblob(8))),
    context_id TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT '',
    peer_id TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // Create minimal tasks table so runResilienceMigration can add columns
  db.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    context_id TEXT NOT NULL DEFAULT 'main',
    schedule TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    next_run TEXT
  )`);
  runResilienceMigration(db);

  const bus = new MessageBus();
  const adapters = new Map<string, any>();
  // Dummy whatsapp adapter
  adapters.set('whatsapp', {
    async send() {},
    status: () => 'connected',
    connectedAt: () => null,
  });

  const runners = new Map<string, AgentRunner>();
  runners.set('main', runner);

  const config = {
    routing: { default: 'main', rules: [] },
    agent: { turnTimeout: 5000 },
  };

  const orch = new Orchestrator(config as any, bus, adapters, runners, db);
  orch.start();

  return { orch, bus, db };
}

// ─── Task 6: origin columns on tasks table ────────────────────────────────────────────────

describe('runResilienceMigration — origin columns', () => {
  it('adds origin_channel and origin_peer to tasks table', () => {
    const db = makeDb();

    // Create tasks table first (migration may create it or guard against missing)
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL,
        schedule TEXT NOT NULL,
        prompt TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        next_run TEXT
      )
    `);

    runResilienceMigration(db);

    const cols = getTableColumns(db, 'tasks');
    expect(cols).toContain('origin_channel');
    expect(cols).toContain('origin_peer');
  });

  it('is idempotent — running migration twice does not error', () => {
    const db = makeDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, context_id TEXT NOT NULL,
        schedule TEXT NOT NULL, prompt TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active', next_run TEXT
      )
    `);

    expect(() => {
      runResilienceMigration(db);
      runResilienceMigration(db);
    }).not.toThrow();
  });

  it('existing task rows are unaffected — columns default to NULL', () => {
    const db = makeDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, context_id TEXT NOT NULL,
        schedule TEXT NOT NULL, prompt TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active', next_run TEXT
      )
    `);
    db.prepare(
      `INSERT INTO tasks (id, context_id, schedule, prompt) VALUES ('t1', 'main', 'daily', 'test')`
    ).run();

    runResilienceMigration(db);

    const row = db.prepare('SELECT origin_channel, origin_peer FROM tasks WHERE id = ?').get('t1') as any;
    expect(row.origin_channel).toBeNull();
    expect(row.origin_peer).toBeNull();
  });
});

// ─── Task 7: user message written to DB after turn ─────────────────────────────────────────

describe('Orchestrator — user message persistence', () => {
  it('writes user message row after turn completes', async () => {
    const { bus, db } = makeOrchestratorWithRunner(makeMockRunner());

    bus.publish(createIncomingMessage({
      channelType: 'whatsapp',
      peerId: '+40X',
      content: 'hello',
      raw: null,
    }));

    // Wait for turn to complete
    await new Promise(r => setTimeout(r, 100));

    const rows = db.prepare("SELECT role, content, channel, peer_id FROM messages WHERE role = 'user'").all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('hello');
    expect(rows[0].channel).toBe('whatsapp');
    expect(rows[0].peer_id).toBe('+40X');
  });

  it('does NOT write user message for scheduler turns', async () => {
    const { bus, db } = makeOrchestratorWithRunner(makeMockRunner());

    bus.publish(createIncomingMessage({
      channelType: 'scheduler',
      peerId: 'scheduler',
      content: 'scheduled task',
      raw: null,
    }));

    await new Promise(r => setTimeout(r, 100));

    const rows = db.prepare("SELECT * FROM messages").all();
    expect(rows).toHaveLength(0);
  });

  it('writes assistant message row on successful turn with response', async () => {
    const { bus, db } = makeOrchestratorWithRunner(makeMockRunner('world'));

    bus.publish(createIncomingMessage({
      channelType: 'whatsapp', peerId: '+40X', content: 'hello', raw: null,
    }));

    await new Promise(r => setTimeout(r, 100));

    const rows = db.prepare("SELECT role, content FROM messages ORDER BY rowid").all() as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].role).toBe('user');
    expect(rows[1].role).toBe('assistant');
    expect(rows[1].content).toBe('world');
  });

  it('does NOT write assistant row when turn produces no response', async () => {
    const { bus, db } = makeOrchestratorWithRunner(makeMockRunner(''));

    bus.publish(createIncomingMessage({
      channelType: 'whatsapp', peerId: '+40X', content: 'ping', raw: null,
    }));

    await new Promise(r => setTimeout(r, 100));

    const rows = db.prepare("SELECT role FROM messages").all() as any[];
    // Only user row — no assistant row for empty response
    expect(rows.filter((r: any) => r.role === 'assistant')).toHaveLength(0);
  });

  it('writes user message even when turn errors (MP-1/MP-3)', async () => {
    const { bus, db } = makeOrchestratorWithRunner(makeFailingRunner());

    bus.publish(createIncomingMessage({
      channelType: 'whatsapp',
      peerId: '+40X',
      content: 'this will fail',
      raw: null,
    }));

    await new Promise(r => setTimeout(r, 300));

    const userRows = db.prepare("SELECT role, content FROM messages WHERE role = 'user'").all() as any[];
    expect(userRows).toHaveLength(1);
    expect(userRows[0].content).toBe('this will fail');

    const assistantRows = db.prepare("SELECT * FROM messages WHERE role = 'assistant'").all();
    expect(assistantRows).toHaveLength(0);
  });

  it('does NOT write user message for recovery turns', async () => {
    const { bus, db } = makeOrchestratorWithRunner(makeMockRunner());

    bus.publish(createIncomingMessage({
      channelType: 'recovery',
      peerId: 'main',
      content: 'recovered prompt',
      raw: null,
    }));

    await new Promise(r => setTimeout(r, 100));

    const rows = db.prepare("SELECT * FROM messages").all();
    expect(rows).toHaveLength(0);
  });
});
