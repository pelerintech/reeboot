import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

async function getGuard() {
  const { BudgetGuard } = await import('@src/budget/guard.js');
  return BudgetGuard;
}

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

describe('BudgetGuard', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  it('TB-2-A: returns ok=true immediately when all limits are null', async () => {
    const BudgetGuard = await getGuard();
    const guard = new BudgetGuard();
    const result = guard.check(db, 'ctx1', makeConfig());
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.warning).toBeUndefined();
  });

  it('TB-2-B: daily token limit blocks when breached', async () => {
    const BudgetGuard = await getGuard();
    const guard = new BudgetGuard();

    // Insert 105000 tokens today
    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, created_at)
      VALUES ('ctx1', 60000, 45000, 'test', datetime('now'))
    `).run();

    const result = guard.check(db, 'ctx1', makeConfig({ daily_tokens: 100000 }));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Daily token limit/);
    expect(result.reason).toMatch(/105000/);
    expect(result.reason).toMatch(/100000/);
  });

  it('TB-2-C: daily cost limit blocks when breached', async () => {
    const BudgetGuard = await getGuard();
    const guard = new BudgetGuard();

    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, created_at)
      VALUES ('ctx1', 100, 50, 'test', 5.42, datetime('now'))
    `).run();

    const result = guard.check(db, 'ctx1', makeConfig({ daily_cost_usd: 5.0 }));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Daily cost limit/);
    expect(result.reason).toMatch(/5\.42/);
    expect(result.reason).toMatch(/5\.00/);
  });

  it('TB-2-D: warn threshold fires before hard stop (does not block)', async () => {
    const BudgetGuard = await getGuard();
    const guard = new BudgetGuard();

    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, created_at)
      VALUES ('ctx1', 50000, 32000, 'test', datetime('now'))
    `).run();

    const result = guard.check(db, 'ctx1', makeConfig({ daily_tokens: 100000, warn_threshold: 0.8 }));
    expect(result.ok).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.warning).toMatch(/82%/);
    expect(result.warning).toMatch(/82000/);
  });

  it('TB-2-D: warn fires only once per threshold crossing', async () => {
    const BudgetGuard = await getGuard();
    const guard = new BudgetGuard();

    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, created_at)
      VALUES ('ctx1', 50000, 32000, 'test', datetime('now'))
    `).run();

    const config = makeConfig({ daily_tokens: 100000, warn_threshold: 0.8 });
    const first = guard.check(db, 'ctx1', config);
    const second = guard.check(db, 'ctx1', config);

    expect(first.warning).toBeDefined();
    expect(second.warning).toBeUndefined(); // suppressed — already warned
  });

  it('TB-2-E: session token limit blocks current session spend', async () => {
    const BudgetGuard = await getGuard();
    const guard = new BudgetGuard();

    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, created_at)
      VALUES ('ctx1', 30000, 22000, 'test', datetime('now'))
    `).run();

    const result = guard.check(db, 'ctx1', makeConfig({ session_tokens: 50000 }));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Session token limit/);
    expect(result.reason).toMatch(/52000/);
  });

  it('TB-2-F: turn limit uses last turn actual cost', async () => {
    const BudgetGuard = await getGuard();
    const guard = new BudgetGuard();

    db.prepare(`
      INSERT INTO usage (context_id, input_tokens, output_tokens, model, created_at)
      VALUES ('ctx1', 8000, 4000, 'test', datetime('now'))
    `).run();

    const result = guard.check(db, 'ctx1', makeConfig({ turn_tokens: 10000 }));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/per-turn token limit/);
    expect(result.reason).toMatch(/12000/);
  });
});
