import type { Database } from 'better-sqlite3';
import { pruneTurns } from '../resilience/turn-journal.js';
import { getLogger } from './logger.js';
import { readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── pruneObservabilityData ───────────────────────────────────────────────────

/**
 * Deletes observability data older than retentionDays from:
 * - operational_logs table
 * - events table
 * - turn_journal (closed rows only, via pruneTurns)
 * - log files in ~/.reeboot/logs/
 *
 * Safe to call multiple times (idempotent).
 */
export function pruneObservabilityData(db: Database, retentionDays: number): void {
  const cutoff = `-${retentionDays} days`;

  // Prune operational logs
  try {
    db.prepare(
      `DELETE FROM operational_logs WHERE created_at < datetime('now', ?)`
    ).run(cutoff);
  } catch (err) {
    getLogger().warn({ component: 'retention', err }, 'Failed to prune operational_logs');
  }

  // Prune audit events
  try {
    db.prepare(
      `DELETE FROM events WHERE created_at < datetime('now', ?)`
    ).run(cutoff);
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
