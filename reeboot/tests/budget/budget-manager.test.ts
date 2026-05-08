import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
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
  `);
  db.prepare(`INSERT INTO contexts (id, name) VALUES ('main', 'Main')`).run();
  return db;
}

function makeMockPi(handlers: Record<string, Function[]> = {}, tools: Record<string, Function> = {}) {
  return {
    on(event: string, handler: Function) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    tool(name: string, description: string, schema: any, handler: Function) {
      tools[name] = handler;
    },
    handlers,
    tools,
  };
}

describe('budget-manager extension', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'budget-manager-test-'));
    db = makeDb();
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('set_budget stores budget in closure and writes .task_budget.json', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    // Call set_budget
    expect(tools['set_budget']).toBeDefined();
    const result = await tools['set_budget']({ amount: 5, unit: 'usd' });
    expect(result).toMatch(/\$5\.00/);
    expect(result).toMatch(/[Bb]udget set/);

    // .task_budget.json should be written
    const budgetFile = join(tmpDir, '.task_budget.json');
    expect(existsSync(budgetFile)).toBe(true);
    const budgetData = JSON.parse(readFileSync(budgetFile, 'utf-8'));
    expect(budgetData.amount).toBe(5);
    expect(budgetData.unit).toBe('usd');
  });

  it('set_budget works with token unit', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    const result = await tools['set_budget']({ amount: 500000, unit: 'tokens' });
    expect(result).toMatch(/500k tokens/i);
  });

  it('check_budget returns structured result with no spend', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    // Set a budget first
    await tools['set_budget']({ amount: 5, unit: 'usd' });

    const result = await tools['check_budget']({});
    expect(result).toMatch(/\$0\.00/);
    expect(result).toMatch(/\$5\.00/);
    expect(result).toMatch(/0%/);
    expect(result).toMatch(/\$5\.00 remaining/);
  });

  it('check_budget returns no-budget message when no task budget is active', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    const result = await tools['check_budget']({});
    expect(result).toMatch(/[Nn]o active task budget/);
  });
});
