import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runResilienceMigration, runObservabilityMigration } from '@src/db/schema.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      model_provider TEXT NOT NULL DEFAULT '', model_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`INSERT INTO contexts (id, name) VALUES ('main', 'main')`);
  db.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, context_id TEXT NOT NULL, schedule TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active', next_run TEXT, last_result TEXT,
    context_mode TEXT NOT NULL DEFAULT 'shared'
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, context_id TEXT NOT NULL, channel TEXT NOT NULL DEFAULT '',
    peer_id TEXT NOT NULL DEFAULT '', role TEXT NOT NULL, content TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  runResilienceMigration(db);
  runObservabilityMigration(db);
  return db;
}

function makeMsg(overrides: Partial<{ channelType: string; peerId: string; content: string }> = {}) {
  const { createIncomingMessage } = require('@src/channels/interface.js');
  return createIncomingMessage({
    channelType: overrides.channelType ?? 'whatsapp',
    peerId: overrides.peerId ?? 'peer1',
    content: overrides.content ?? 'hello',
    raw: null,
  });
}

function makeAdapter() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue('connected'),
    init: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
}

function makeConfig(overrides: any = {}) {
  return {
    routing: { default: 'main', rules: [] },
    session: { inactivityTimeout: 14_400_000 },
    agent: { turnTimeout: 5000, rateLimitRetries: 0, _testBackoffMs: 0 },
    contexts: [{ id: 'main', name: 'Main', modelProvider: 'test', modelId: 'test' }],
    logging: { level: 'info', retention_days: 30 },
    ...overrides,
  } as any;
}

describe('Turn lifecycle audit events', () => {
  it('inserts turn_started event when a turn begins', async () => {
    vi.resetModules();
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus, createIncomingMessage } = await import('@src/channels/interface.js');
    const db = makeDb();

    const runner = {
      prompt: vi.fn().mockImplementation(async (_: string, onEvent: any) => {
        onEvent({ type: 'text_delta', delta: 'hello' });
      }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = makeAdapter();
    const bus = new MessageBus();
    const orc = new Orchestrator(
      makeConfig(), bus, new Map([['whatsapp', adapter]]), new Map([['main', runner]]), db
    );
    orc.start();

    bus.publish(createIncomingMessage({ channelType: 'whatsapp', peerId: 'peer1', content: 'hi', raw: null }));
    await new Promise(r => setTimeout(r, 50));

    const events = db.prepare("SELECT * FROM events WHERE type = 'turn_started'").all() as any[];
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].context_id).toBe('main');
    expect(events[0].severity).toBe(9);
  });

  it('inserts turn_completed event when a turn succeeds', async () => {
    vi.resetModules();
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus, createIncomingMessage } = await import('@src/channels/interface.js');
    const db = makeDb();

    const runner = {
      prompt: vi.fn().mockImplementation(async (_: string, onEvent: any) => {
        onEvent({ type: 'text_delta', delta: 'done' });
      }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = makeAdapter();
    const bus = new MessageBus();
    const orc = new Orchestrator(
      makeConfig(), bus, new Map([['whatsapp', adapter]]), new Map([['main', runner]]), db
    );
    orc.start();

    bus.publish(createIncomingMessage({ channelType: 'whatsapp', peerId: 'peer1', content: 'hi', raw: null }));
    await new Promise(r => setTimeout(r, 50));

    const events = db.prepare("SELECT * FROM events WHERE type = 'turn_completed'").all() as any[];
    expect(events.length).toBeGreaterThan(0);
    const payload = JSON.parse(events[0].payload);
    expect(payload).toHaveProperty('durationMs');
  });

  it('inserts turn_failed event when a turn errors', async () => {
    vi.resetModules();
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus, createIncomingMessage } = await import('@src/channels/interface.js');
    const db = makeDb();

    const runner = {
      prompt: vi.fn().mockRejectedValue(new Error('provider down')),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = makeAdapter();
    const bus = new MessageBus();
    const orc = new Orchestrator(
      makeConfig(), bus, new Map([['whatsapp', adapter]]), new Map([['main', runner]]), db
    );
    orc.start();

    bus.publish(createIncomingMessage({ channelType: 'whatsapp', peerId: 'peer1', content: 'hi', raw: null }));
    await new Promise(r => setTimeout(r, 100));

    const events = db.prepare("SELECT * FROM events WHERE type = 'turn_failed'").all() as any[];
    expect(events.length).toBeGreaterThan(0);
  });
});
