import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';

describe('runResilienceMigration', () => {
  it('creates turn_journal, turn_journal_steps, and outage_events tables', async () => {
    const { runResilienceMigration } = await import('@src/db/schema.js');
    const db = new Database(':memory:');
    // tasks table must exist first (migration may alter it)
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL,
        schedule TEXT NOT NULL,
        prompt TEXT NOT NULL
      )
    `);
    runResilienceMigration(db);

    const tableNames = (db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as Array<{ name: string }>).map(r => r.name);

    expect(tableNames).toContain('turn_journal');
    expect(tableNames).toContain('turn_journal_steps');
    expect(tableNames).toContain('outage_events');
  });

  it('adds catchup column to tasks table', async () => {
    const { runResilienceMigration } = await import('@src/db/schema.js');
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL,
        schedule TEXT NOT NULL,
        prompt TEXT NOT NULL
      )
    `);
    runResilienceMigration(db);

    const cols = (db.pragma('table_info(tasks)') as Array<{ name: string }>).map(c => c.name);
    expect(cols).toContain('catchup');
  });

  it('is idempotent — calling twice does not throw', async () => {
    const { runResilienceMigration } = await import('@src/db/schema.js');
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL,
        schedule TEXT NOT NULL,
        prompt TEXT NOT NULL
      )
    `);
    runResilienceMigration(db);
    expect(() => runResilienceMigration(db)).not.toThrow();
  });

  it('turn_journal_steps has ON DELETE CASCADE from turn_journal', async () => {
    const { runResilienceMigration } = await import('@src/db/schema.js');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, schedule TEXT NOT NULL, prompt TEXT NOT NULL)`);
    runResilienceMigration(db);

    // Enable foreign keys
    db.pragma('foreign_keys = ON');

    // Insert a journal row and a step
    db.exec(`INSERT INTO turn_journal (turn_id, context_id) VALUES ('t1', 'ctx1')`);
    db.exec(`INSERT INTO turn_journal_steps (turn_id, seq, tool_name, tool_input) VALUES ('t1', 1, 'search', '{}')`);

    // Delete the journal row — steps should cascade
    db.exec(`DELETE FROM turn_journal WHERE turn_id = 't1'`);
    const steps = db.prepare('SELECT * FROM turn_journal_steps WHERE turn_id = ?').all('t1');
    expect(steps).toHaveLength(0);
  });
});
