import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration } from '../../src/db/schema.js';

describe('schema migration — cron next_run', () => {
  it('populates next_run for a cron row where it is NULL', () => {
    const db = new Database(':memory:');

    // Create a minimal tasks table with the columns runMigration needs
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL DEFAULT 'ctx1',
        schedule TEXT NOT NULL DEFAULT '',
        prompt TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        last_run TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        schedule_type TEXT,
        schedule_value TEXT,
        normalized_ms INTEGER,
        next_run TEXT
      )
    `);

    db.prepare(`
      INSERT INTO tasks (id, schedule_type, schedule_value, next_run)
      VALUES ('task1', 'cron', '0 * * * *', NULL)
    `).run();

    // runMigration adds missing columns and computes next_run for cron rows
    runMigration(db);

    const row = db.prepare("SELECT next_run FROM tasks WHERE id = 'task1'").get() as { next_run: string | null };

    expect(row.next_run).not.toBeNull();
    expect(new Date(row.next_run!).getTime()).toBeGreaterThan(Date.now());
  });
});
