import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runResilienceMigration, runObservabilityMigration } from '@src/db/schema.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runResilienceMigration(db);
  runObservabilityMigration(db);
  return db;
}

describe('Operational log retention pruning', () => {
  it('imports pruneObservabilityData from the module', async () => {
    const mod = await import('@src/observability/retention.js');
    expect(typeof mod.pruneObservabilityData).toBe('function');
  });

  it('deletes operational_logs rows older than retentionDays', async () => {
    const { pruneObservabilityData } = await import('@src/observability/retention.js');
    const db = makeDb();

    // Insert an old row (31 days ago)
    db.prepare(`INSERT INTO operational_logs (level, msg, component, created_at) VALUES (40, 'old warn', 'test', datetime('now', '-31 days'))`).run();
    // Insert a recent row
    db.prepare(`INSERT INTO operational_logs (level, msg, component) VALUES (40, 'recent warn', 'test')`).run();

    pruneObservabilityData(db, 30);

    const all = db.prepare('SELECT * FROM operational_logs').all() as any[];
    expect(all).toHaveLength(1);
    expect(all[0].msg).toBe('recent warn');
  });

  it('deletes events rows older than retentionDays', async () => {
    const { pruneObservabilityData } = await import('@src/observability/retention.js');
    const db = makeDb();

    db.prepare(`INSERT INTO events (id, type, severity, created_at) VALUES ('old-evt', 'turn_started', 9, datetime('now', '-31 days'))`).run();
    db.prepare(`INSERT INTO events (id, type, severity) VALUES ('new-evt', 'turn_started', 9)`).run();

    pruneObservabilityData(db, 30);

    const all = db.prepare('SELECT * FROM events').all() as any[];
    expect(all).toHaveLength(1);
    expect((all[0] as any).id).toBe('new-evt');
  });

  it('deletes closed turn_journal rows older than retentionDays', async () => {
    const { pruneObservabilityData } = await import('@src/observability/retention.js');
    const db = makeDb();

    // Insert old closed turn
    db.prepare(`INSERT INTO turn_journal (turn_id, context_id, status, closed_at) VALUES ('old-t', 'main', 'closed', datetime('now', '-31 days'))`).run();
    // Insert recent closed turn
    db.prepare(`INSERT INTO turn_journal (turn_id, context_id, status, closed_at) VALUES ('new-t', 'main', 'closed', datetime('now'))`).run();

    pruneObservabilityData(db, 30);

    const all = db.prepare('SELECT * FROM turn_journal').all() as any[];
    expect(all).toHaveLength(1);
    expect((all[0] as any).turn_id).toBe('new-t');
  });

  it('never deletes open turn_journal rows', async () => {
    const { pruneObservabilityData } = await import('@src/observability/retention.js');
    const db = makeDb();

    db.prepare(`INSERT INTO turn_journal (turn_id, context_id, status, started_at) VALUES ('open-t', 'main', 'open', datetime('now', '-60 days'))`).run();

    pruneObservabilityData(db, 30);

    const row = db.prepare(`SELECT * FROM turn_journal WHERE turn_id = 'open-t'`).get();
    expect(row).toBeDefined();
  });

  it('is idempotent — calling twice on same data does not throw', async () => {
    const { pruneObservabilityData } = await import('@src/observability/retention.js');
    const db = makeDb();

    expect(() => {
      pruneObservabilityData(db, 30);
      pruneObservabilityData(db, 30);
    }).not.toThrow();
  });
});
