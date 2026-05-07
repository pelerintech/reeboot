import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      context_id TEXT,
      channel TEXT,
      peer_id TEXT,
      severity INTEGER NOT NULL DEFAULT 9,
      payload TEXT NOT NULL DEFAULT '{}',
      trace_id TEXT, span_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_ns INTEGER
    );
  `);
  return db;
}

function makeMockPi(handlers: Record<string, Function[]> = {}, tools: Record<string, Function> = {}) {
  return {
    on(event: string, handler: Function) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    tool(name: string, _desc: string, _schema: any, handler: Function) {
      tools[name] = handler;
    },
    handlers,
    tools,
  };
}

describe('budget_status tool', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'budget-status-test-'));
    db = makeDb();
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('TB-4-A: daily spend query returns today total', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    // Insert today's usage
    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, created_at)
      VALUES ('main', 100000, 42000, 'test-model', 2.84, datetime('now'))
    `).run();

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    expect(tools['budget_status']).toBeDefined();

    const result = await tools['budget_status']({ period: 'today' });
    expect(result).toMatch(/Today/);
    expect(result).toMatch(/\$2\.84/);
    expect(result).toMatch(/no daily limit set/);
  });

  it('TB-4-A: shows remaining when daily limit is configured', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, created_at)
      VALUES ('main', 100000, 42000, 'test-model', 2.84, datetime('now'))
    `).run();

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, {
      workspacePath: tmpDir,
      config: { budget: { daily_cost_usd: 10.0, warn_threshold: 0.8 } },
    });

    const result = await tools['budget_status']({ period: 'today' });
    expect(result).toMatch(/\$7\.16/);  // 10.00 - 2.84 = 7.16 remaining
    expect(result).toMatch(/\$10\.00/);
    expect(result).toMatch(/28%/);
  });

  it('TB-4-B: operation_type filter with period=last', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, operation_type, created_at)
      VALUES ('main', 5000, 3000, 'test', 0.12, 'memory', datetime('now'))
    `).run();

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    const result = await tools['budget_status']({ operationType: 'memory', period: 'last' });
    expect(result).toMatch(/Last memory run/);
    expect(result).toMatch(/\$0\.12/);
  });

  it('TB-4-B: returns no-data message when operation type has no rows', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    const result = await tools['budget_status']({ operationType: 'memory', period: 'last' });
    expect(result).toMatch(/No memory operations found/);
  });

  it('TB-4-C: zero-cost model says cost unavailable (not $0.00)', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, created_at)
      VALUES ('main', 100000, 42000, 'local-model', 0, datetime('now'))
    `).run();

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    const result = await tools['budget_status']({ period: 'today' });
    expect(result).toMatch(/cost unavailable/);
    expect(result).not.toMatch(/\$0\.00 spent/);
    expect(result).toMatch(/100k/);  // token count still shown
  });
});
