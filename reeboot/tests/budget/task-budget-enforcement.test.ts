import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, existsSync } from 'fs';
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
    registerTool(toolDef: any) {
      tools[toolDef.name] = async (params: any) => {
        const result = await toolDef.execute('', params, undefined, undefined, {});
        return result.content[0].text;
      };
    },
    handlers,
    tools,
  };
}

describe('Per-task budget enforcement', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'task-budget-test-'));
    db = makeDb();
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('TB-3-B: turn_end accumulates cost against task budget', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    // Set $1.00 task budget
    await tools['set_budget']({ amount: 1.0, unit: 'usd' });

    // Simulate turn_end with $0.40 cost
    await handlers['turn_end'][0](
      { message: { usage: { cost: { total: 0.40 } } } },
      {}
    );

    // check_budget should show $0.40 spent
    const result1 = await tools['check_budget']({});
    expect(result1).toMatch(/\$0\.40/);

    // Simulate another turn_end with $0.80
    await handlers['turn_end'][0](
      { message: { usage: { cost: { total: 0.80 } } } },
      {}
    );

    // check_budget should show $1.20 spent
    const result2 = await tools['check_budget']({});
    expect(result2).toMatch(/\$1\.20/);
  });

  it('TB-3-D: budget exhaustion injects wrap-up via before_agent_start returning { systemPrompt }', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    // Set $1.00 task budget
    await tools['set_budget']({ amount: 1.0, unit: 'usd' });

    // Three turn_end events: $0.40 + $0.40 + $0.40 = $1.20 > $1.00
    for (let i = 0; i < 3; i++) {
      await handlers['turn_end'][0](
        { message: { usage: { cost: { total: 0.40 } } } },
        {}
      );
    }

    // On next before_agent_start, should return { systemPrompt } with wrap-up instruction
    // This is the correct pi API (returns value rather than mutating context)
    expect(handlers['before_agent_start']).toBeDefined();
    const result = await handlers['before_agent_start'][0](
      { systemPrompt: 'You are a helpful assistant.' },
      {}
    );

    expect(result).toBeDefined();
    expect(result.systemPrompt).toMatch(/BUDGET EXHAUSTED/);
    expect(result.systemPrompt).toMatch(/\$1\.\d+/); // spent amount
    // Original system prompt content is preserved
    expect(result.systemPrompt).toMatch(/helpful assistant/);
  });

  it('TB-3-E: agent_end clears task budget and deletes file', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    // Set budget
    await tools['set_budget']({ amount: 5, unit: 'usd' });
    const budgetFile = join(tmpDir, '.task_budget.json');
    expect(existsSync(budgetFile)).toBe(true);

    // Fire agent_end
    await handlers['agent_end'][0]({}, {});

    // Budget file should be gone
    expect(existsSync(budgetFile)).toBe(false);

    // check_budget should return "No active task budget"
    const result = await tools['check_budget']({});
    expect(result).toMatch(/[Nn]o active task budget/);
  });
});
