/**
 * Spec: events-retention-bound
 * `pruneObservabilityData` bounds `events` growth by a severity-tiered time window
 * (INFO pruned after a shorter window) plus a per-context row cap.
 */
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

/**
 * Insert an event. `daysAgo` controls the created_at via SQLite datetime('now','-N days')
 * (interpolated as SQL, not a bound string). `createdNs` is a bound integer for ordering.
 */
function insertEvent(db: Database.Database, opts: {
  id: string; type?: string; severity: number; contextId: string;
  daysAgo: number; createdNs: number; traceId?: string;
}) {
  const createdAtSql = opts.daysAgo === 0
    ? "datetime('now')"
    : `datetime('now','-${opts.daysAgo} days')`;
  const traceId = opts.traceId ?? opts.id.padEnd(32, '0').slice(0, 32);
  const spanId = opts.id.padEnd(16, '0').slice(0, 16);
  db.exec(
    `INSERT INTO events (id, type, context_id, severity, payload, trace_id, span_id, created_at, created_ns)
     VALUES ('${opts.id}', '${opts.type ?? 'turn_started'}', '${opts.contextId}', ${opts.severity},
             '{}', '${traceId}', '${spanId}', ${createdAtSql}, ${opts.createdNs})`
  );
}

describe('events-retention-bound', () => {
  it('S1: 10-day-old INFO pruned, today INFO kept (info window=7)', async () => {
    const { pruneObservabilityData } = await import('@src/observability/retention.js');
    const db = makeDb();
    insertEvent(db, { id: 'old-info', severity: 9, contextId: 'main', daysAgo: 10, createdNs: 1 });
    insertEvent(db, { id: 'new-info', severity: 9, contextId: 'main', daysAgo: 0, createdNs: 2 });

    pruneObservabilityData(db, { retentionDays: 30, eventsInfoRetentionDays: 7, eventsMaxRowsPerContext: 5000 });

    const ids = (db.prepare('SELECT id FROM events').all() as any[]).map(r => r.id);
    expect(ids).not.toContain('old-info');
    expect(ids).toContain('new-info');
  });

  it('S2: 10-day-old WARN retained (only INFO subject to short window)', async () => {
    const { pruneObservabilityData } = await import('@src/observability/retention.js');
    const db = makeDb();
    insertEvent(db, { id: 'old-warn', severity: 13, contextId: 'main', daysAgo: 10, createdNs: 1 });

    pruneObservabilityData(db, { retentionDays: 30, eventsInfoRetentionDays: 7, eventsMaxRowsPerContext: 5000 });

    const ids = (db.prepare('SELECT id FROM events').all() as any[]).map(r => r.id);
    expect(ids).toContain('old-warn');
  });

  it('S3: 40-day-old WARN pruned (past main window)', async () => {
    const { pruneObservabilityData } = await import('@src/observability/retention.js');
    const db = makeDb();
    insertEvent(db, { id: 'ancient-warn', severity: 13, contextId: 'main', daysAgo: 40, createdNs: 1 });

    pruneObservabilityData(db, { retentionDays: 30, eventsInfoRetentionDays: 7, eventsMaxRowsPerContext: 5000 });

    const ids = (db.prepare('SELECT id FROM events').all() as any[]).map(r => r.id);
    expect(ids).not.toContain('ancient-warn');
  });

  it('S4: per-context cap keeps newest N (6 rows, cap 5)', async () => {
    const { pruneObservabilityData } = await import('@src/observability/retention.js');
    const db = makeDb();
    for (let i = 1; i <= 6; i++) {
      insertEvent(db, { id: `e${i}`, severity: 13, contextId: 'main', daysAgo: 0, createdNs: i });
    }

    pruneObservabilityData(db, { retentionDays: 30, eventsInfoRetentionDays: 7, eventsMaxRowsPerContext: 5 });

    const rows = db.prepare('SELECT id FROM events ORDER BY created_ns').all() as any[];
    expect(rows).toHaveLength(5);
    expect(rows.map(r => r.id)).toEqual(['e2', 'e3', 'e4', 'e5', 'e6']); // newest 5
  });

  it('S5: cap applied per context independently', async () => {
    const { pruneObservabilityData } = await import('@src/observability/retention.js');
    const db = makeDb();
    for (let i = 1; i <= 6; i++) {
      insertEvent(db, { id: `m${i}`, severity: 13, contextId: 'main', daysAgo: 0, createdNs: i });
    }
    for (let i = 1; i <= 2; i++) {
      insertEvent(db, { id: `w${i}`, severity: 13, contextId: 'work', daysAgo: 0, createdNs: i });
    }

    pruneObservabilityData(db, { retentionDays: 30, eventsInfoRetentionDays: 7, eventsMaxRowsPerContext: 5 });

    const mainCount = (db.prepare("SELECT COUNT(*) AS n FROM events WHERE context_id='main'").get() as any).n;
    const workCount = (db.prepare("SELECT COUNT(*) AS n FROM events WHERE context_id='work'").get() as any).n;
    expect(mainCount).toBe(5);
    expect(workCount).toBe(2);
  });

  it('S6: bare numeric call pruneObservabilityData(db, 30) still works', async () => {
    const { pruneObservabilityData } = await import('@src/observability/retention.js');
    const db = makeDb();
    insertEvent(db, { id: 'ancient', severity: 13, contextId: 'main', daysAgo: 40, createdNs: 1 });
    insertEvent(db, { id: 'recent', severity: 13, contextId: 'main', daysAgo: 0, createdNs: 2 });

    expect(() => pruneObservabilityData(db, 30)).not.toThrow();

    const ids = (db.prepare('SELECT id FROM events').all() as any[]).map(r => r.id);
    expect(ids).not.toContain('ancient');
    expect(ids).toContain('recent');
  });
});
