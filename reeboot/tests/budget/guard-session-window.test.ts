import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

/** Format a Date as SQLite-compatible 'YYYY-MM-DD HH:MM:SS' (UTC) */
function toSqliteUtc(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
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

describe('BudgetGuard — session window (D1)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = makeDb();
  });

  it('S1: session spend excludes pre-session rows', async () => {
    const { BudgetGuard } = await import('@src/budget/guard.js');

    // Pre-session row: 40000 tokens from 1 hour ago
    const sessionStart = toSqliteUtc(new Date());
    const oneHourAgo = toSqliteUtc(new Date(Date.now() - 3_600_000));
    db.prepare(
      `INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, operation_type, created_at)
       VALUES ('ctx1', 20000, 20000, 'test', 0, 'user_message', ?)`
    ).run(oneHourAgo);

    // In-session row: 20000 tokens (after session start)
    db.prepare(
      `INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, operation_type, created_at)
       VALUES ('ctx1', 10000, 10000, 'test', 0, 'user_message', ?)`
    ).run(sessionStart);

    const guard = new BudgetGuard(sessionStart);
    const result = guard.check(db, 'ctx1', makeConfig({ session_tokens: 30000 }));

    // Session spend is 20000 (only in-session), within 30000 limit → ok
    expect(result.ok).toBe(true);
  });

  it('S2: session breach still triggers within the window', async () => {
    const { BudgetGuard } = await import('@src/budget/guard.js');

    const sessionStart = toSqliteUtc(new Date());

    // Two in-session rows totaling 35000 tokens
    db.prepare(
      `INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, operation_type, created_at)
       VALUES ('ctx1', 20000, 5000, 'test', 0, 'user_message', ?)`
    ).run(sessionStart);
    db.prepare(
      `INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, operation_type, created_at)
       VALUES ('ctx1', 5000, 5000, 'test', 0, 'user_message', ?)`
    ).run(sessionStart);

    const guard = new BudgetGuard(sessionStart);
    const result = guard.check(db, 'ctx1', makeConfig({ session_tokens: 30000 }));

    // 35000 > 30000 → blocked
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/session/i);
  });

  it('S3: daily limits unaffected (still use start-of-day)', async () => {
    const { BudgetGuard } = await import('@src/budget/guard.js');

    const sessionStart = toSqliteUtc(new Date());
    // Use daily_tokens high enough to avoid the warn_threshold (80%) so the
    // session check is reached before the daily warning early-return.
    // This will be cleaned up by Task D2 (warning-ordering).

    // Insert rows spanning today (daily scope, not session scope)
    db.prepare(
      `INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, operation_type, created_at)
       VALUES ('ctx1', 30000, 10000, 'test', 0, 'user_message', ?)`
    ).run(sessionStart);

    const guard = new BudgetGuard(sessionStart);
    // daily_tokens=100000 keeps usage (40000) well below warn threshold (80% = 80000)
    const result = guard.check(db, 'ctx1', makeConfig({ daily_tokens: 100000, session_tokens: 30000 }));

    // Daily: 40000 < 100000 → ok; Session: 40000 > 30000 → blocked
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/session/i);
  });
});
