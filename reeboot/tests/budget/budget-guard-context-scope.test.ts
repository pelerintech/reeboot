import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

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
  db.prepare(`INSERT INTO contexts (id, name) VALUES ('ctx1', 'Main')`).run();
  db.prepare(`INSERT INTO contexts (id, name) VALUES ('ctx2', 'Other')`).run();
  return db;
}

function makeConfig(budgetOverrides: Record<string, any> = {}) {
  return {
    budget: {
      daily_tokens: null,
      daily_cost_usd: null,
      session_tokens: null,
      session_cost_usd: null,
      turn_tokens: null,
      turn_cost_usd: null,
      warn_threshold: 0.8,
      ...budgetOverrides,
    },
  } as any;
}

describe('TB-2-B: daily limit is per-context, not global', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  it('does not block ctx1 when tokens are from a different context (ctx2)', async () => {
    const { BudgetGuard } = await import('@src/budget/guard.js');
    const guard = new BudgetGuard();

    // ctx2 has 150000 tokens today — over the 100000 limit
    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, created_at)
      VALUES ('ctx2', 100000, 50000, 'test', datetime('now'))
    `).run();
    // ctx1 has 0 tokens today — under the limit

    // Checking budget for ctx1 should NOT block (ctx2's spend is irrelevant)
    const result = guard.check(db, 'ctx1', makeConfig({ daily_tokens: 100000 }));
    expect(result.ok).toBe(true);
  });

  it('blocks ctx1 when ctx1 itself has exceeded the daily token limit', async () => {
    const { BudgetGuard } = await import('@src/budget/guard.js');
    const guard = new BudgetGuard();

    // ctx1 has 150000 tokens today — over the 100000 limit
    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, created_at)
      VALUES ('ctx1', 100000, 50000, 'test', datetime('now'))
    `).run();

    const result = guard.check(db, 'ctx1', makeConfig({ daily_tokens: 100000 }));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Daily token limit/);
  });

  it('does not block ctx1 when ctx2 has exceeded daily cost but ctx1 has not', async () => {
    const { BudgetGuard } = await import('@src/budget/guard.js');
    const guard = new BudgetGuard();

    // ctx2 has $10.00 spent today — over the $5.00 limit
    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, created_at)
      VALUES ('ctx2', 100, 50, 'test', 10.0, datetime('now'))
    `).run();
    // ctx1 has $0 spent

    const result = guard.check(db, 'ctx1', makeConfig({ daily_cost_usd: 5.0 }));
    expect(result.ok).toBe(true);
  });
});
