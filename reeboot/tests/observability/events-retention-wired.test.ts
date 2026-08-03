/**
 * Spec: events-retention-bound (integration, socket-free)
 * Building the app with `config.logging.events_info_retention_days` /
 * `events_max_rows_per_context` set causes `pruneObservabilityData` to receive
 * them (observed via effect on seeded rows).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { openDatabase, closeDb } from '../../src/db/index.js';
import { runObservabilityMigration } from '../../src/db/schema.js';
import type Database from 'better-sqlite3';

let tmpDir: string;
let db: Database.Database;
let stopServer: any;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `reeboot-events-retention-wired-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = openDatabase(join(tmpDir, 'test.db'));
  db.exec('DELETE FROM events');
  stopServer = (await import('../../src/server.js')).stopServer;
});

afterEach(async () => {
  try { await stopServer(); } catch { /* ignore */ }
  try { closeDb(); } catch { /* ignore */ }
  rmSync(tmpDir, { recursive: true, force: true });
});

async function buildAppWith(config: any) {
  const { buildApp } = await import('../../src/server.js');
  return buildApp({ db, reebotDir: tmpDir, config });
}

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
    seedEvent('old-info', 9, 5, 1);
    seedEvent('new-info', 9, 0, 2);

    await buildAppWith({ agent: { model: { authMode: 'own', provider: 'openai', id: 'm', apiKey: 'k', providers: [] } }, channels: {}, logging: { events_info_retention_days: 3, retention_days: 30 } });

    const ids = (db.prepare('SELECT id FROM events').all() as any[]).map(r => r.id);
    expect(ids).not.toContain('old-info');
    expect(ids).toContain('new-info');
  });

  it('events_max_rows_per_context caps rows at startup', async () => {
    runObservabilityMigration(db);
    for (let i = 1; i <= 6; i++) seedEvent(`e${i}`, 13, 0, i);

    await buildAppWith({ agent: { model: { authMode: 'own', provider: 'openai', id: 'm', apiKey: 'k', providers: [] } }, channels: {}, logging: { events_max_rows_per_context: 5, retention_days: 30 } });

    const n = (db.prepare("SELECT COUNT(*) AS n FROM events WHERE context_id='main'").get() as any).n;
    expect(n).toBe(5);
  });
});
