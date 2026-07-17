/**
 * Spec: turn-trace-correlation
 * The orchestrator mirrors a turn's `turnId` into the `trace_id` of every event it
 * emits for that turn, so all of a turn's events share one 32-hex trace id.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runResilienceMigration, runObservabilityMigration } from '../src/db/schema.js';
import { createContextsTable } from '../src/context.js';
import { Orchestrator } from '../src/orchestrator.js';
import { MessageBus, createIncomingMessage } from '../src/channels/interface.js';
import type { AgentRunner, RunnerEvent } from '../src/agent-runner/interface.js';

// ─── Mock runners ─────────────────────────────────────────────────────────────

function makeMockRunner(responseText = ''): AgentRunner {
  return {
    async prompt(_content: string, onEvent: (e: RunnerEvent) => void) {
      if (responseText) onEvent({ type: 'text_delta', delta: responseText });
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

// ─── DB / orchestrator wiring ─────────────────────────────────────────────────

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  createContextsTable(db);
  db.prepare(
    `INSERT OR IGNORE INTO contexts (id, name, model_provider, model_id) VALUES ('main', 'main', '', '')`
  ).run();
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
  runObservabilityMigration(db);
  return db;
}

function makeOrchestratorWithRunner(runner: AgentRunner) {
  const db = makeDb();
  const bus = new MessageBus();
  const adapters = new Map<string, any>();
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

function getEvents(db: Database.Database, type: string): any[] {
  return db.prepare('SELECT type, trace_id, payload FROM events WHERE type = ? ORDER BY created_ns').all(type) as any[];
}

const HEX32 = /^[0-9a-f]{32}$/;

// ─── S1 — a turn's lifecycle events share one trace_id ────────────────────────

describe('turn-trace-correlation', () => {
  it('S1: turn_started and turn_completed share one non-empty trace_id', async () => {
    const { bus, db } = makeOrchestratorWithRunner(makeMockRunner('ok'));
    bus.publish(createIncomingMessage({
      channelType: 'whatsapp', peerId: 'p1', content: 'hello', raw: null,
    }));
    await new Promise(r => setTimeout(r, 150));

    const started = getEvents(db, 'turn_started');
    const completed = getEvents(db, 'turn_completed');
    expect(started).toHaveLength(1);
    expect(completed).toHaveLength(1);
    expect(started[0].trace_id).toBeTruthy();
    expect(started[0].trace_id).toBe(completed[0].trace_id);
  });

  // S2 — trace_id equals payload.turnId with hyphens removed, 32 hex
  it('S2: trace_id equals payload.turnId without hyphens and is 32 hex', async () => {
    const { bus, db } = makeOrchestratorWithRunner(makeMockRunner('ok'));
    bus.publish(createIncomingMessage({
      channelType: 'whatsapp', peerId: 'p1', content: 'hello', raw: null,
    }));
    await new Promise(r => setTimeout(r, 150));

    const started = getEvents(db, 'turn_started');
    expect(started).toHaveLength(1);
    const payload = JSON.parse(started[0].payload);
    expect(started[0].trace_id).toBe(payload.turnId.replace(/-/g, ''));
    expect(started[0].trace_id).toMatch(HEX32);
  });

  // S3 — a failed turn shares the same trace_id as its start
  it('S3: turn_started and turn_failed share a trace_id on failure', async () => {
    const { bus, db } = makeOrchestratorWithRunner(makeFailingRunner());
    bus.publish(createIncomingMessage({
      channelType: 'whatsapp', peerId: 'p1', content: 'will fail', raw: null,
    }));
    await new Promise(r => setTimeout(r, 300));

    const started = getEvents(db, 'turn_started');
    const failed = getEvents(db, 'turn_failed');
    expect(started).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(started[0].trace_id).toBe(failed[0].trace_id);
  });

  // S4 — distinct turns get distinct trace_ids
  it('S4: two turns produce two distinct trace_ids', async () => {
    const { bus, db } = makeOrchestratorWithRunner(makeMockRunner('ok'));
    bus.publish(createIncomingMessage({
      channelType: 'whatsapp', peerId: 'p1', content: 'one', raw: null,
    }));
    await new Promise(r => setTimeout(r, 150));
    bus.publish(createIncomingMessage({
      channelType: 'whatsapp', peerId: 'p1', content: 'two', raw: null,
    }));
    await new Promise(r => setTimeout(r, 150));

    const started = getEvents(db, 'turn_started');
    expect(started).toHaveLength(2);
    expect(started[0].trace_id).not.toBe(started[1].trace_id);
  });
});
