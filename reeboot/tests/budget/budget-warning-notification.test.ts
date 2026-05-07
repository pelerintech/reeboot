import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MessageBus, createIncomingMessage } from '@src/channels/interface.js';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      context_id TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      model TEXT NOT NULL DEFAULT '',
      cost_usd REAL NOT NULL DEFAULT 0,
      operation_type TEXT NOT NULL DEFAULT 'user_message',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, context_id TEXT, channel TEXT,
      peer_id TEXT, severity INTEGER NOT NULL DEFAULT 9, payload TEXT NOT NULL DEFAULT '{}',
      trace_id TEXT, span_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), created_ns INTEGER
    );
    CREATE TABLE IF NOT EXISTS turn_journal (
      turn_id TEXT PRIMARY KEY, context_id TEXT NOT NULL, session_path TEXT, prompt TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')), status TEXT NOT NULL DEFAULT 'open', closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, context_id TEXT NOT NULL, channel TEXT NOT NULL, peer_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, tokens_used INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare(`INSERT INTO contexts (id, name) VALUES ('main', 'Main')`).run();
  return db;
}

function makeRunner() {
  return {
    prompt: vi.fn().mockImplementation(async (_: string, onEvent: any) => {
      onEvent({ type: 'text_delta', delta: 'ok' });
      onEvent({ type: 'message_end', runId: 'r1', usage: { input: 10, output: 5 } });
    }),
    abort: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAdapter() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue('connected'),
  };
}

describe('TB-2-D: owner notified via channel on budget warning', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('sends a warning message to the owner channel when threshold is approached', async () => {
    const { Orchestrator } = await import('@src/orchestrator.js');

    const db = makeDb();
    // Insert 85000 tokens today — above 80% of 100000 limit, below hard stop
    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, created_at)
      VALUES ('main', 50000, 35000, 'test', datetime('now'))
    `).run();

    const bus = new MessageBus();
    const runner = makeRunner();
    const adapter = makeAdapter();

    const config = {
      routing: { default: 'main', rules: [] },
      budget: {
        daily_tokens: 100000,
        daily_cost_usd: null,
        session_tokens: null,
        session_cost_usd: null,
        turn_tokens: null,
        turn_cost_usd: null,
        warn_threshold: 0.8,
      },
    };

    const orc = new Orchestrator(
      config,
      bus,
      new Map([['web', adapter]]),
      new Map([['main', runner]]),
      db
    );
    orc.start();

    bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: 'user1',
      content: 'Hello',
      raw: {},
    }));

    await new Promise(r => setTimeout(r, 80));

    // The runner SHOULD have been called (warning doesn't block)
    expect(runner.prompt).toHaveBeenCalled();

    // The adapter SHOULD have been called TWICE:
    // once with the warning message, once with the agent response
    // (or at least once with a warning message)
    const allSentTexts = adapter.send.mock.calls.map((c: any[]) => {
      const payload = c[1];
      return typeof payload === 'string' ? payload : payload?.text ?? '';
    });

    const hasWarning = allSentTexts.some((t: string) =>
      t.match(/budget/i) || t.match(/warning/i) || t.match(/threshold/i) || t.match(/85%/i) || t.match(/85000/i)
    );
    expect(hasWarning).toBe(true);
  });
});
