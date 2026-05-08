/**
 * G10: Session spend scoped to server start time
 *
 * GET /api/settings/budget should return session_cost_usd / session_tokens
 * scoped to rows inserted AFTER the server started, not all of today.
 *
 * today_cost_usd includes all rows from the current calendar day.
 * session_cost_usd includes only rows from the current server session
 * (created_at >= server startTime).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL, model_provider TEXT NOT NULL DEFAULT '', model_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, channel TEXT NOT NULL, peer_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, tokens_used INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, schedule TEXT NOT NULL, prompt TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS channels (type TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'disconnected', config TEXT NOT NULL DEFAULT '{}', connected_at TEXT);
    CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY AUTOINCREMENT, context_id TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, model TEXT NOT NULL DEFAULT '', cost_usd REAL NOT NULL DEFAULT 0, operation_type TEXT NOT NULL DEFAULT 'user_message', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, type TEXT NOT NULL, context_id TEXT, channel TEXT, peer_id TEXT, severity INTEGER NOT NULL DEFAULT 9, payload TEXT NOT NULL DEFAULT '{}', trace_id TEXT, span_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), created_ns INTEGER);
    CREATE TABLE IF NOT EXISTS turn_journal (turn_id TEXT PRIMARY KEY, context_id TEXT NOT NULL, session_path TEXT, prompt TEXT, started_at TEXT NOT NULL DEFAULT (datetime('now')), status TEXT NOT NULL DEFAULT 'open', closed_at TEXT);
    CREATE TABLE IF NOT EXISTS session_events (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, reason TEXT NOT NULL, session_path TEXT, linked_turn_id TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS rate_limits (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, provider TEXT NOT NULL, remaining_tokens INTEGER, remaining_requests INTEGER, retry_after_ms INTEGER, recorded_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS operational_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, level INTEGER NOT NULL, msg TEXT NOT NULL, component TEXT, context_id TEXT, payload TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  `);
  db.prepare(`INSERT INTO contexts (id, name) VALUES ('main', 'main')`).run();
  return db;
}

/** Format a Date as SQLite-compatible 'YYYY-MM-DD HH:MM:SS' (UTC) */
function toSqliteUtc(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

describe('Session spend scoping', () => {
  let tmpDir: string;
  let port: number;
  let stopServer: () => Promise<void>;
  let db: Database.Database;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'session-scope-test-'));
    vi.resetModules();
    db = makeDb();

    // Insert a usage row timestamped 1 hour BEFORE the server module is loaded.
    // This row is from today (same calendar day) but from before this server session.
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const pastTs = toSqliteUtc(oneHourAgo);
    db.prepare(
      `INSERT INTO usage (context_id, input_tokens, output_tokens, model, cost_usd, operation_type, created_at)
       VALUES ('main', 1000, 500, 'test', 1.00, 'user_message', ?)`
    ).run(pastTs);

    // Now import server module — this sets module-level startTime = Date.now()
    writeFileSync(join(tmpDir, 'config.json'), JSON.stringify({
      channels: { web: { enabled: true } },
      budget: { daily_cost_usd: 10.0 },
    }));

    const { loadConfig } = await import('@src/config.js');
    const config = loadConfig(join(tmpDir, 'config.json'));

    const server = await import('@src/server.js');
    const result = await server.startServer({
      port: 0,
      logLevel: 'silent',
      db,
      reebotDir: tmpDir,
      config,
    });
    port = result.port;
    stopServer = server.stopServer;
  });

  afterEach(async () => {
    try { await stopServer(); } catch { /* already stopped */ }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('session_cost_usd excludes rows from before server start', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings/budget`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    // today_cost_usd includes the pre-session row ($1.00 from 1 hour ago)
    expect(body.spend.today_cost_usd).toBeGreaterThanOrEqual(1.0);

    // session_cost_usd excludes it (no rows inserted after server start)
    expect(body.spend.session_cost_usd).toBe(0);
  });

  it('session_tokens excludes rows from before server start', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings/budget`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    // today_tokens includes the pre-session row (1500 tokens)
    expect(body.spend.today_tokens).toBeGreaterThanOrEqual(1500);

    // session_tokens excludes it
    expect(body.spend.session_tokens).toBe(0);
  });
});
