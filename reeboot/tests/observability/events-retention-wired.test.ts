/**
 * Spec: events-retention-bound (integration)
 * Starting the server with `config.logging.events_info_retention_days` /
 * `events_max_rows_per_context` set causes `pruneObservabilityData` to receive
 * them (observed via effect on seeded rows).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';
import { runObservabilityMigration } from '@src/db/schema.js';

let startServer: any;
let stopServer: any;
let tmpDir: string;
let db: Database.Database;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `reeboot-events-retention-wired-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new Database(join(tmpDir, 'test.db'));
  vi.resetModules();
  ({ startServer, stopServer } = await import('@src/server.js'));
});

afterEach(async () => {
  try { await stopServer(); } catch { /* ignore */ }
  try { db.close(); } catch { /* ignore */ }
  rmSync(tmpDir, { recursive: true, force: true });
});

function seedEvent(id: string, severity: number, daysAgo: number, createdNs: number, contextId = 'main') {
  const createdAtSql = daysAgo === 0 ? "datetime('now')" : `datetime('now','-${daysAgo} days')`;
  db.exec(
    `INSERT INTO events (id, type, context_id, severity, payload, trace_id, span_id, created_at, created_ns)
     VALUES ('${id}', 'turn_started', '${contextId}', ${severity}, '{}',
             '${id.padEnd(32, '0').slice(0, 32)}', '${id.padEnd(16, '0').slice(0, 16)}',
             ${createdAtSql}, ${createdNs})`
  );
}

describe('server wires config retention values into pruneObservabilityData', () => {
  it('events_info_retention_days prunes old INFO at startup', async () => {
    runObservabilityMigration(db);
    // 5-day-old INFO → survives default 7-day info window, pruned only if config value (3) is wired
    seedEvent('old-info', 9, 5, 1);
    // today INFO → kept
    seedEvent('new-info', 9, 0, 2);

    await startServer({
      port: 0, logLevel: 'silent', db, reebotDir: tmpDir,
      config: { logging: { events_info_retention_days: 3, retention_days: 30 } } as any,
    });

    const ids = (db.prepare('SELECT id FROM events').all() as any[]).map(r => r.id);
    expect(ids).not.toContain('old-info');
    expect(ids).toContain('new-info');
  });

  it('events_max_rows_per_context caps rows at startup', async () => {
    runObservabilityMigration(db);
    for (let i = 1; i <= 6; i++) seedEvent(`e${i}`, 13, 0, i);

    await startServer({
      port: 0, logLevel: 'silent', db, reebotDir: tmpDir,
      config: { logging: { events_max_rows_per_context: 5, retention_days: 30 } } as any,
    });

    const n = (db.prepare("SELECT COUNT(*) AS n FROM events WHERE context_id='main'").get() as any).n;
    expect(n).toBe(5);
  });
});
