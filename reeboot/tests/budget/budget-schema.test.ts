import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';

describe('runBudgetMigration', () => {
  it('adds cost_usd and operation_type columns to usage table', async () => {
    const { runBudgetMigration } = await import('@src/db/schema.js');
    const db = new Database(':memory:');

    // Create base usage table (as it exists before migration)
    db.exec(`
      CREATE TABLE IF NOT EXISTS contexts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context_id TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    runBudgetMigration(db);

    const cols = (db.pragma('table_info(usage)') as Array<{ name: string; dflt_value: string | null }>);
    const colNames = cols.map(c => c.name);

    expect(colNames).toContain('cost_usd');
    expect(colNames).toContain('operation_type');

    // Check defaults
    const costCol = cols.find(c => c.name === 'cost_usd');
    const opCol = cols.find(c => c.name === 'operation_type');
    expect(costCol?.dflt_value).toBe('0');
    expect(opCol?.dflt_value).toBe("'user_message'");
  });

  it('is idempotent — safe to call multiple times', async () => {
    const { runBudgetMigration } = await import('@src/db/schema.js');
    const db = new Database(':memory:');

    db.exec(`
      CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context_id TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    expect(() => {
      runBudgetMigration(db);
      runBudgetMigration(db);
    }).not.toThrow();

    const cols = (db.pragma('table_info(usage)') as Array<{ name: string }>).map(c => c.name);
    expect(cols).toContain('cost_usd');
    expect(cols).toContain('operation_type');
  });
});
