import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMemoryMigration } from '../../src/db/schema.js';

/**
 * Helper: apply the minimal base schema (contexts + messages) to an in-memory
 * db so runMemoryMigration has the tables it depends on.
 */
function applyBaseSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model_provider TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      context_id TEXT NOT NULL REFERENCES contexts(id),
      channel TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

describe('memory schema migration', () => {
  it('creates messages_fts FTS5 virtual table', () => {
    const db = new Database(':memory:');
    applyBaseSchema(db);

    runMemoryMigration(db);

    // Check that messages_fts exists as a virtual table
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'")
      .get() as { name: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.name).toBe('messages_fts');
  });

  it('creates memory_log table with all required columns', () => {
    const db = new Database(':memory:');
    applyBaseSchema(db);

    runMemoryMigration(db);

    // Verify table exists
    const tableRow = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_log'")
      .get() as { name: string } | undefined;
    expect(tableRow).toBeDefined();

    // Verify columns
    const cols = (db.pragma('table_info(memory_log)') as Array<{ name: string }>).map(
      (c) => c.name
    );
    expect(cols).toContain('id');
    expect(cols).toContain('ran_at');
    expect(cols).toContain('trigger');
    expect(cols).toContain('sessions_processed');
    expect(cols).toContain('ops_applied');
    expect(cols).toContain('memory_chars_before');
    expect(cols).toContain('memory_chars_after');
    expect(cols).toContain('user_chars_before');
    expect(cols).toContain('user_chars_after');
    expect(cols).toContain('notes');
  });

  it('migration is idempotent — running twice does not throw', () => {
    const db = new Database(':memory:');
    applyBaseSchema(db);

    expect(() => runMemoryMigration(db)).not.toThrow();
    expect(() => runMemoryMigration(db)).not.toThrow();
  });

  it('FTS trigger backfills existing messages into FTS index', () => {
    const db = new Database(':memory:');
    applyBaseSchema(db);

    // Insert a message BEFORE migration (backfill test)
    db.exec(`INSERT INTO contexts (id, name) VALUES ('ctx1', 'Test')`);
    db.prepare(
      `INSERT INTO messages (id, context_id, channel, peer_id, role, content)
       VALUES ('msg1', 'ctx1', 'web', 'peer1', 'user', 'Hello backfill world')`
    ).run();

    runMemoryMigration(db);

    // The backfilled message should be searchable
    const result = db
      .prepare(`SELECT rowid FROM messages_fts WHERE messages_fts MATCH 'backfill'`)
      .all();
    expect(result.length).toBeGreaterThan(0);
  });

  it('INSERT trigger keeps FTS in sync for new messages', () => {
    const db = new Database(':memory:');
    applyBaseSchema(db);
    runMemoryMigration(db);

    db.exec(`INSERT INTO contexts (id, name) VALUES ('ctx2', 'Test2')`);
    db.prepare(
      `INSERT INTO messages (id, context_id, channel, peer_id, role, content)
       VALUES ('msg2', 'ctx2', 'web', 'peer2', 'assistant', 'TypeScript monorepo discussion')`
    ).run();

    const result = db
      .prepare(`SELECT rowid FROM messages_fts WHERE messages_fts MATCH 'monorepo'`)
      .all();
    expect(result.length).toBeGreaterThan(0);
  });
});
