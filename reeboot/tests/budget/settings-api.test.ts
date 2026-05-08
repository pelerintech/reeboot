import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
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

describe('Budget settings API', () => {
  let tmpDir: string;
  let port: number;
  let stopServer: () => Promise<void>;
  let db: Database.Database;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'budget-api-test-'));
    db = makeDb();
    vi.resetModules();

    // Write a config.json with budget limits to tmpDir (used as reebotDir)
    writeFileSync(join(tmpDir, 'config.json'), JSON.stringify({
      channels: { web: { enabled: true } },
      budget: {
        daily_cost_usd: 10.0,
        warn_threshold: 0.8,
      },
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

  it('GET /api/settings/budget returns limits and spend', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings/budget`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.limits).toBeDefined();
    expect(body.limits.daily_cost_usd).toBe(10.0);
    expect(body.limits.warn_threshold).toBe(0.8);
    expect(body.spend).toBeDefined();
    expect(typeof body.spend.today_cost_usd).toBe('number');
    expect(typeof body.spend.today_tokens).toBe('number');
  });

  it('PUT /api/settings/budget updates config and is reflected in next GET', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daily_cost_usd: 15.0 }),
    });
    expect(res.status).toBe(200);

    const getRes = await fetch(`http://localhost:${port}/api/settings/budget`);
    const body = await getRes.json() as any;
    expect(body.limits.daily_cost_usd).toBe(15.0);
  });
});
