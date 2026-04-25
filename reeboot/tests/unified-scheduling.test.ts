/**
 * Tests for unified scheduling:
 * - Task 10: origin_channel / origin_peer stored on schedule_task
 * - Task 11: fired prompt enriched with routing instructions
 * - Task 12: scheduler reply routed to origin channel, not fake adapter
 * - Task 13: timer tool removed, heartbeat still registered
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createSchedulerTools, buildScheduledPrompt } from '../src/scheduler.js';
import { Orchestrator } from '../src/orchestrator.js';
import { MessageBus, createIncomingMessage } from '../src/channels/interface.js';
import type { AgentRunner, RunnerEvent } from '../src/agent-runner/interface.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL, model_provider TEXT NOT NULL DEFAULT '', model_id TEXT NOT NULL DEFAULT '');
    INSERT OR IGNORE INTO contexts VALUES ('main','main','','');
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      context_id TEXT NOT NULL DEFAULT 'main',
      schedule TEXT NOT NULL DEFAULT '',
      schedule_type TEXT NOT NULL DEFAULT 'interval',
      schedule_value TEXT NOT NULL DEFAULT '',
      normalized_ms INTEGER,
      prompt TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      next_run TEXT,
      last_result TEXT,
      context_mode TEXT NOT NULL DEFAULT 'shared',
      catchup TEXT,
      origin_channel TEXT,
      origin_peer TEXT
    );
    CREATE TABLE IF NOT EXISTS task_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL DEFAULT (datetime('now')),
      duration_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      result TEXT,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY DEFAULT (hex(randomblob(8))),
      context_id TEXT NOT NULL, channel TEXT NOT NULL DEFAULT '',
      peer_id TEXT NOT NULL DEFAULT '', role TEXT NOT NULL,
      content TEXT NOT NULL, tokens_used INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS turn_journal (
      turn_id TEXT PRIMARY KEY, context_id TEXT NOT NULL,
      session_path TEXT, prompt TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'open'
    );
    CREATE TABLE IF NOT EXISTS turn_journal_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turn_id TEXT NOT NULL, seq INTEGER NOT NULL,
      tool_name TEXT NOT NULL, tool_input TEXT NOT NULL,
      tool_output TEXT, is_error INTEGER NOT NULL DEFAULT 0,
      fired_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

const mockScheduler = { registerJob: () => {}, cancelJob: () => {} };

function makeResponseRunner(responseText: string): AgentRunner {
  return {
    async prompt(_content: string, onEvent: (e: RunnerEvent) => void) {
      if (responseText) onEvent({ type: 'text_delta', delta: responseText });
      onEvent({ type: 'message_end', runId: 'r1', usage: { input: 0, output: 0 } });
    },
    abort() {}, async dispose() {}, async reload() {},
  };
}

// ─── Task 11: buildScheduledPrompt ───────────────────────────────────────────

describe('buildScheduledPrompt', () => {
  it('includes original prompt, channel, peer, and send_message instruction when origin set', () => {
    const task = {
      id: 't1', context_id: 'main', schedule: 'every 1h', schedule_type: 'interval',
      schedule_value: 'every 1h', normalized_ms: 3600000, prompt: 'remind user to drink water',
      enabled: 1, last_run: null, status: 'active', next_run: null, last_result: null,
      context_mode: 'shared', catchup: null,
      origin_channel: 'whatsapp', origin_peer: '+40X',
    };

    const result = buildScheduledPrompt(task as any);

    expect(result).toContain('remind user to drink water');
    expect(result).toContain('whatsapp');
    expect(result).toContain('+40X');
    expect(result).toContain('automatically delivered');
  });

  it('instructs broadcast when origin_channel is null', () => {
    const task = {
      id: 't2', context_id: 'main', schedule: 'daily', schedule_type: 'cron',
      schedule_value: '0 9 * * *', normalized_ms: null, prompt: 'daily briefing',
      enabled: 1, last_run: null, status: 'active', next_run: null, last_result: null,
      context_mode: 'shared', catchup: null,
      origin_channel: null, origin_peer: null,
    };

    const result = buildScheduledPrompt(task as any);

    expect(result).toContain('daily briefing');
    expect(result.toLowerCase()).toContain('broadcast');
  });
});

// ─── Task 12: scheduler reply routing ────────────────────────────────────────────

describe('Orchestrator — scheduler reply routing', () => {
  it('routes scheduler reply to origin_channel adapter when origin is set', async () => {
    const sentTo: Array<{ peerId: string; text: string }> = [];
    const mockWaAdapter = {
      async send(peerId: string, content: any) { sentTo.push({ peerId, text: content.text }); },
      status: () => 'connected' as const, connectedAt: () => null,
      init: async () => {}, start: async () => {}, stop: async () => {},
      selfAddress: () => null,
    };

    const runner = makeResponseRunner('Here is your reminder!');
    const db = makeDb();
    const bus = new MessageBus();
    const adapters = new Map<string, any>();
    adapters.set('whatsapp', mockWaAdapter);
    const runners = new Map<string, AgentRunner>();
    runners.set('main', runner);
    const orch = new Orchestrator(
      { routing: { default: 'main', rules: [] }, agent: { turnTimeout: 5000 } } as any,
      bus, adapters, runners, db
    );
    orch.start();

    bus.publish(createIncomingMessage({
      channelType: 'scheduler',
      peerId: 'scheduler',
      content: '[scheduled task] remind user to drink water',
      raw: { taskId: 'task-1', origin_channel: 'whatsapp', origin_peer: '+40X' },
    }));

    await new Promise(r => setTimeout(r, 200));

    expect(sentTo.length).toBeGreaterThan(0);
    expect(sentTo[0].peerId).toBe('+40X');
    expect(sentTo[0].text).toContain('reminder');
  });

  it('broadcasts when origin_channel is absent from raw', async () => {
    const sentTo: string[] = [];
    const mockAdapter = {
      async send(peerId: string) { sentTo.push(peerId); },
      status: () => 'connected' as const, connectedAt: () => null,
      init: async () => {}, start: async () => {}, stop: async () => {},
      selfAddress: () => null,
    };

    const runner = makeResponseRunner('broadcast message');
    const db = makeDb();
    const bus = new MessageBus();
    const adapters = new Map<string, any>();
    adapters.set('web', mockAdapter);
    adapters.set('whatsapp', { ...mockAdapter, send: async (p: string) => sentTo.push(p) });
    const runners = new Map<string, AgentRunner>();
    runners.set('main', runner);
    const orch = new Orchestrator(
      { routing: { default: 'main', rules: [] }, agent: { turnTimeout: 5000 } } as any,
      bus, adapters, runners, db
    );
    orch.start();

    bus.publish(createIncomingMessage({
      channelType: 'scheduler', peerId: 'scheduler',
      content: 'daily briefing task',
      raw: { taskId: 'task-2', origin_channel: null, origin_peer: null },
    }));

    await new Promise(r => setTimeout(r, 200));

    // Should have sent to all adapters (web + whatsapp = at least 2)
    expect(sentTo.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Task 13: timer tool removed, heartbeat still present ──────────────────────────

describe('scheduler extension — tool registration', () => {
  it('does NOT register the timer tool', async () => {
    const registeredTools: string[] = [];
    const mockPi: any = {
      registerTool(def: { name: string }) { registeredTools.push(def.name); },
      registerCommand() {},
      on() {},
    };

    const { default: schedulerExt } = await import('../src/extensions/scheduler-tool.js');
    schedulerExt(mockPi);

    expect(registeredTools).not.toContain('timer');
  });

  it('still registers heartbeat, schedule_task, list_tasks, cancel_task', async () => {
    const registeredTools: string[] = [];
    const mockPi: any = {
      registerTool(def: { name: string }) { registeredTools.push(def.name); },
      registerCommand() {},
      on() {},
    };

    const mod = await import('../src/extensions/scheduler-tool.js?t=' + Date.now());
    (mod.default ?? (mod as any))(mockPi);

    expect(registeredTools).toContain('heartbeat');
    expect(registeredTools).toContain('schedule_task');
    expect(registeredTools).toContain('list_tasks');
    expect(registeredTools).toContain('cancel_task');
  });
});

// ─── Task 10: origin_channel and origin_peer stored ───────────────────────────

describe('schedule_task — origin fields', () => {
  let db: Database.Database;

  beforeEach(() => { db = makeDb(); });

  it('stores origin_channel and origin_peer when provided', async () => {
    const tools = createSchedulerTools(db, mockScheduler);
    await tools.schedule_task({
      schedule: 'every 1h',
      prompt: 'remind me to drink water',
      origin_channel: 'whatsapp',
      origin_peer: '+40X',
    });

    const row = db.prepare('SELECT origin_channel, origin_peer FROM tasks LIMIT 1').get() as any;
    expect(row.origin_channel).toBe('whatsapp');
    expect(row.origin_peer).toBe('+40X');
  });

  it('stores NULL for origin fields when not provided', async () => {
    const tools = createSchedulerTools(db, mockScheduler);
    await tools.schedule_task({ schedule: 'daily', prompt: 'morning briefing' });

    const row = db.prepare('SELECT origin_channel, origin_peer FROM tasks LIMIT 1').get() as any;
    expect(row.origin_channel).toBeNull();
    expect(row.origin_peer).toBeNull();
  });
});
