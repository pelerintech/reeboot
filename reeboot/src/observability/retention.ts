import type { Database } from 'better-sqlite3';
import { pruneTurns } from '../resilience/turn-journal.js';
import { getLogger } from './logger.js';
import { readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── pruneObservabilityData ───────────────────────────────────────────────────

export interface PruneOptions {
  retentionDays: number;
  /** Shorter window for INFO-severity events (severity < 13). Default 7. */
  eventsInfoRetentionDays?: number;
  /** Hard per-context row backstop for the `events` table. Default 8000. */
  eventsMaxRowsPerContext?: number;
}

/**
 * Deletes observability data older than retentionDays from:
 * - operational_logs table
 * - events table (severity-tiered: INFO pruned after a shorter window; plus a
 *   per-context row cap so the audit store cannot balloon under fan-out)
 * - turn_journal (closed rows only, via pruneTurns)
 * - log files in ~/.reeboot/logs/
 *
 * Accepts either a bare `retentionDays` number (back-compatible) or an options
 * object. Safe to call multiple times (idempotent).
 */
export function pruneObservabilityData(db: Database, retentionDaysOrOpts: number | PruneOptions): void {
  const opts: PruneOptions = typeof retentionDaysOrOpts === 'number'
    ? { retentionDays: retentionDaysOrOpts }
    : retentionDaysOrOpts;
  const retentionDays = opts.retentionDays;
  const infoDays = opts.eventsInfoRetentionDays ?? 7;
  const maxRowsPerContext = opts.eventsMaxRowsPerContext ?? 8000;
  const cutoff = `-${retentionDays} days`;
  const infoCutoff = `-${infoDays} days`;

  // Prune operational logs (flat window)
  try {
    db.prepare(
      `DELETE FROM operational_logs WHERE created_at < datetime('now', ?)`
    ).run(cutoff);
  } catch (err) {
    getLogger().warn({ component: 'retention', err }, 'Failed to prune operational_logs');
  }

  // Prune audit events — severity-tiered
  try {
    // (a) INFO tier: severity < 13 pruned after the shorter window
    db.prepare(
      `DELETE FROM events WHERE severity < 13 AND created_at < datetime('now', ?)`
    ).run(infoCutoff);
    // (b) all-severity flat window
    db.prepare(
      `DELETE FROM events WHERE created_at < datetime('now', ?)`
    ).run(cutoff);
    // (c) per-context row cap: keep only the newest N per context_id
    const ctxRows = db.prepare(
      `SELECT DISTINCT context_id FROM events WHERE context_id IS NOT NULL`
    ).all() as Array<{ context_id: string }>;
    const capStmt = db.prepare(
      `DELETE FROM events WHERE id IN (
         SELECT id FROM events WHERE context_id = ? ORDER BY created_ns DESC LIMIT -1 OFFSET ?
       )`
    );
    for (const { context_id } of ctxRows) {
      capStmt.run(context_id, maxRowsPerContext);
    }
  } catch (err) {
    getLogger().warn({ component: 'retention', err }, 'Failed to prune events');
  }

  // Prune closed turn_journal rows
  try {
    pruneTurns(db, retentionDays);
  } catch (err) {
    getLogger().warn({ component: 'retention', err }, 'Failed to prune turn_journal');
  }

  // Prune old log files
  pruneLogFiles(retentionDays);
}

// ─── armRetentionTimer ────────────────────────────────────────────────────────

/**
 * Arms a periodic retention sweep and returns the interval handle so the caller
 * can clear it on shutdown. Extracted from the server bootstrap so the periodic
 * behavior (a prune pass runs on each tick, and stops once cleared) is
 * deterministically unit-testable with fake timers — rather than only assertable
 * by reading the source.
 */
export function armRetentionTimer(
  db: Database,
  opts: PruneOptions,
  intervalMs: number,
): ReturnType<typeof setInterval> {
  return setInterval(() => pruneObservabilityData(db, opts), intervalMs);
}

// ─── pruneLogFiles ────────────────────────────────────────────────────────────

function pruneLogFiles(retentionDays: number): void {
  const logDir = join(homedir(), '.reeboot', 'logs');
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  try {
    const files = readdirSync(logDir);
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      const filePath = join(logDir, file);
      try {
        const st = statSync(filePath);
        if (st.mtimeMs < cutoffMs) {
          unlinkSync(filePath);
          getLogger().info({ component: 'retention', file }, `Deleted old log file: ${file}`);
        }
      } catch { /* ignore individual file errors */ }
    }
  } catch { /* log dir may not exist */ }
}
