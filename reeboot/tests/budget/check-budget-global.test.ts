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
      id TEXT PRIMARY KEY, type TEXT NOT NULL, context_id TEXT, channel TEXT,
      peer_id TEXT, severity INTEGER NOT NULL DEFAULT 9, payload TEXT NOT NULL DEFAULT '{}',
      trace_id TEXT, span_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), created_ns INTEGER
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

describe('TB-3-C: check_budget global section shows actual spend vs limit', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'check-budget-global-test-'));
    db = makeDb();
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('shows actual today spend vs daily cost limit in check_budget global section', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    // Seed today's usage: $2.84 spent
    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, created_at)
      VALUES ('main', 100000, 42000, 'test', 2.84, datetime('now'))
    `).run();

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, {
      workspacePath: tmpDir,
      config: {
        budget: {
          daily_cost_usd: 10.0,
          warn_threshold: 0.8,
        },
      },
    });

    // Set a task budget so we can call check_budget
    await tools['set_budget']({ amount: 5, unit: 'usd' });

    const result = await tools['check_budget']({});

    // Should show actual spend ($2.84) vs limit ($10.00)
    // Spec: "Daily global: $2.84 of $10.00 (28% used)"
    expect(result).toMatch(/\$2\.84/);   // actual spend
    expect(result).toMatch(/\$10\.00/);  // limit
    expect(result).toMatch(/28%/);       // percentage
  });

  it('check_budget without active task budget still shows global spend', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, created_at)
      VALUES ('main', 50000, 20000, 'test', 1.50, datetime('now'))
    `).run();

    const handlers: Record<string, Function[]> = {};
    const tools: Record<string, Function> = {};
    const pi = makeMockPi(handlers, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, {
      workspacePath: tmpDir,
      config: {
        budget: {
          daily_cost_usd: 10.0,
          warn_threshold: 0.8,
        },
      },
    });

    const result = await tools['check_budget']({});

    // Even with no task budget, global spend should be shown
    expect(result).toMatch(/\$1\.50/);   // actual spend
    expect(result).toMatch(/\$10\.00/);  // limit
    expect(result).toMatch(/15%/);       // percentage (1.50/10.00)
  });
});
