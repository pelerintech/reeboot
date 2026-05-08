import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runResilienceMigration } from '@src/db/schema.js';

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return row !== undefined;
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map((c) => c.name);
  return cols.includes(column);
}

describe('observability schema migration', () => {
  it('new tables do NOT exist before migration on a fresh DB', () => {
    const db = new Database(':memory:');
    // Apply only base resilience schema (no observability)
    runResilienceMigration(db);

    expect(tableExists(db, 'events')).toBe(false);
    expect(tableExists(db, 'session_events')).toBe(false);
    expect(tableExists(db, 'rate_limits')).toBe(false);
    expect(tableExists(db, 'operational_logs')).toBe(false);
    expect(columnExists(db, 'turn_journal', 'closed_at')).toBe(false);
  });

  it('runObservabilityMigration creates all four tables', async () => {
    const { runObservabilityMigration } = await import('@src/db/schema.js');
    const db = new Database(':memory:');
    runResilienceMigration(db);
    runObservabilityMigration(db);

    expect(tableExists(db, 'events')).toBe(true);
    expect(tableExists(db, 'session_events')).toBe(true);
    expect(tableExists(db, 'rate_limits')).toBe(true);
    expect(tableExists(db, 'operational_logs')).toBe(true);
  });

  it('events table has correct columns', async () => {
    const { runObservabilityMigration } = await import('@src/db/schema.js');
    const db = new Database(':memory:');
    runResilienceMigration(db);
    runObservabilityMigration(db);

    const cols = (db.pragma('table_info(events)') as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('type');
    expect(cols).toContain('context_id');
    expect(cols).toContain('channel');
    expect(cols).toContain('peer_id');
    expect(cols).toContain('severity');
    expect(cols).toContain('payload');
    expect(cols).toContain('trace_id');
    expect(cols).toContain('span_id');
    expect(cols).toContain('created_at');
    expect(cols).toContain('created_ns');
  });

  it('turn_journal has closed_at column after migration', async () => {
    const { runObservabilityMigration } = await import('@src/db/schema.js');
    const db = new Database(':memory:');
    runResilienceMigration(db);
    runObservabilityMigration(db);

    expect(columnExists(db, 'turn_journal', 'closed_at')).toBe(true);
  });

  it('migration is idempotent — calling twice does not throw', async () => {
    const { runObservabilityMigration } = await import('@src/db/schema.js');
    const db = new Database(':memory:');
    runResilienceMigration(db);
    expect(() => {
      runObservabilityMigration(db);
      runObservabilityMigration(db);
    }).not.toThrow();
  });
});
