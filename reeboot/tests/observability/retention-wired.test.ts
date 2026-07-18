/**
 * Spec: retention-periodic (WS-E3)
 * Observability retention runs *periodically*, not only once at boot.
 *
 * These tests exercise the real periodic behavior via `armRetentionTimer` (the
 * seam extracted from `startServer`), driven with fake timers so the interval
 * callback fires deterministically — no real server boot, no real-clock races.
 *
 * NOTE on determinism/safety:
 *  - The interval callback runs `pruneObservabilityData`, which is synchronous
 *    (better-sqlite3), so advancing fake timers prunes within the same tick.
 *  - SQLite's `datetime('now','-N days')` uses SQLite's own (real) clock, so a
 *    seeded "10-day-old" row is genuinely over-age regardless of fake JS timers.
 *  - `retentionDays: 365` keeps the main window + log-file window far in the past
 *    so the test cannot touch any real `~/.reeboot/logs` file; pruning is proven
 *    via the INFO short-window (`eventsInfoRetentionDays: 7`).
 *
 * The at-boot single prune (startup wiring) is covered behaviorally by
 * `events-retention-wired.test.ts` (real `startServer`); this file covers the
 * periodic sweep + teardown that a full-server fake-timer test cannot isolate.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runResilienceMigration, runObservabilityMigration } from '@src/db/schema.js';
import { armRetentionTimer } from '@src/observability/retention.js';

// Main/log window kept far in the past; pruning proven via the INFO short window.
const OPTS = { retentionDays: 365, eventsInfoRetentionDays: 7, eventsMaxRowsPerContext: 5000 };

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runResilienceMigration(db);
  runObservabilityMigration(db);
  return db;
}

/** Insert one INFO event `daysAgo` old (created_at via SQLite's real clock). */
function insertInfoEvent(db: Database.Database, id: string, daysAgo: number, createdNs: number) {
  const createdAtSql = daysAgo === 0 ? "datetime('now')" : `datetime('now','-${daysAgo} days')`;
  const traceId = id.padEnd(32, '0').slice(0, 32);
  const spanId = id.padEnd(16, '0').slice(0, 16);
  db.exec(
    `INSERT INTO events (id, type, context_id, severity, payload, trace_id, span_id, created_at, created_ns)
     VALUES ('${id}', 'turn_started', 'main', 9, '{}', '${traceId}', '${spanId}', ${createdAtSql}, ${createdNs})`
  );
}

function countEvents(db: Database.Database): number {
  return (db.prepare('SELECT count(*) AS n FROM events').get() as any).n;
}

describe('retention-periodic — armRetentionTimer', () => {
  let db: Database.Database;

  beforeEach(() => {
    vi.useFakeTimers();
    db = makeDb();
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  it('S1/S2: a prune pass runs on each interval tick after arming', () => {
    const timer = armRetentionTimer(db, OPTS, 1000);
    try {
      // An over-age INFO row inserted AFTER arming (i.e. not caught by any boot prune).
      insertInfoEvent(db, 'over-age-1', 10, 1);
      expect(countEvents(db)).toBe(1); // present before any tick

      vi.advanceTimersByTime(1000); // first periodic tick
      expect(countEvents(db)).toBe(0); // pruned by the interval callback

      // A second over-age row appears; the NEXT tick must also prune it,
      // proving the sweep is periodic (repeats), not a one-shot at boot.
      insertInfoEvent(db, 'over-age-2', 10, 2);
      expect(countEvents(db)).toBe(1);
      vi.advanceTimersByTime(1000);
      expect(countEvents(db)).toBe(0);
    } finally {
      clearInterval(timer);
    }
  });

  it('S2b: a fresh (in-window) row survives while the over-age row is pruned', () => {
    const timer = armRetentionTimer(db, OPTS, 1000);
    try {
      insertInfoEvent(db, 'stale', 10, 1); // > 7-day info window → should be pruned
      insertInfoEvent(db, 'fresh', 0, 2);  // today → should survive
      vi.advanceTimersByTime(1000);

      const ids = (db.prepare('SELECT id FROM events').all() as any[]).map((r) => r.id);
      expect(ids).toEqual(['fresh']);
    } finally {
      clearInterval(timer);
    }
  });

  it('S3: clearing the timer stops further pruning (no timer leak)', () => {
    const timer = armRetentionTimer(db, OPTS, 1000);
    // Prove it was live first.
    insertInfoEvent(db, 'before-clear', 10, 1);
    vi.advanceTimersByTime(1000);
    expect(countEvents(db)).toBe(0);

    // Clear (this is what stopServer does with _retentionTimer).
    clearInterval(timer);

    // A new over-age row must NOT be pruned across several intervals now.
    insertInfoEvent(db, 'after-clear', 10, 2);
    vi.advanceTimersByTime(5000);
    expect(countEvents(db)).toBe(1);
    expect((db.prepare('SELECT id FROM events').get() as any).id).toBe('after-clear');
  });
});
