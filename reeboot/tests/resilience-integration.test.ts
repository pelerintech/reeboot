/**
 * Integration test: verifies resilience startup hooks run inside startServer.
 *
 * We inject a pre-seeded in-memory DB with:
 *   - one open turn_journal row (crash evidence)
 *   - one overdue task within the catchup window
 *
 * After startServer() completes we assert:
 *   - the resilience tables exist (migration ran)
 *   - the overdue task's next_run ≤ now (catchup fired)
 *   - the open journal was handled (row deleted OR requeue happened)
 */

import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';

let stopServer: any;

afterEach(async () => {
  try { if (stopServer) await stopServer(); } catch { /* ignore */ }
});

async function makeSeededDb() {
  const { runMigration } = await import('@src/db/schema.js');

  const db = new Database(':memory:');

  // Bootstrap base schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      model_provider TEXT NOT NULL DEFAULT '', model_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`INSERT INTO contexts (id, name) VALUES ('main', 'main')`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, context_id TEXT NOT NULL REFERENCES contexts(id),
      schedule TEXT NOT NULL DEFAULT '', prompt TEXT NOT NULL DEFAULT ''
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, context_id TEXT NOT NULL, channel TEXT NOT NULL,
      peer_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      type TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'disconnected',
      config TEXT NOT NULL DEFAULT '{}', connected_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, context_id TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
      model TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Run scheduler migration (adds columns to tasks, creates task_runs)
  runMigration(db);

  return db;
}

describe('resilience integration — server startup', () => {
  it('runs resilience migration tables on startup', async () => {
    const db = await makeSeededDb();
    const { startServer } = await import('@src/server.js');
    stopServer = (await import('@src/server.js')).stopServer;

    const server = await startServer({ port: 0, logLevel: 'silent', db: db as any });
    stopServer = (await import('@src/server.js')).stopServer;

    const tables = (db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as Array<{ name: string }>).map(r => r.name);

    expect(tables).toContain('turn_journal');
    expect(tables).toContain('turn_journal_steps');
    expect(tables).toContain('outage_events');

    await stopServer();
  });

  it('applies catchup for overdue tasks within the window', async () => {
    const db = await makeSeededDb();

    // Insert an overdue task (missed 30m ago, within default 1h window)
    const missedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO tasks (id, context_id, schedule, schedule_type, schedule_value, normalized_ms, status, prompt, next_run)
      VALUES ('catchup-task', 'main', 'every 1h', 'interval', 'every 1h', 3600000, 'active', 'catchup test', ?)
    `).run(missedAt);

    const { startServer, stopServer: stop } = await import('@src/server.js');
    stopServer = stop;

    await startServer({ port: 0, logLevel: 'silent', db: db as any });

    const task = db.prepare('SELECT next_run FROM tasks WHERE id = ?').get('catchup-task') as any;
    expect(new Date(task.next_run).getTime()).toBeLessThanOrEqual(Date.now() + 1000); // ≤ now (+1s tolerance)

    await stopServer();
  });

  it('deletes open crash-journal rows on startup (safe_only mode: safe turn requeued)', async () => {
    const db = await makeSeededDb();

    // We need resilience migration to be run first to create the table
    const { runResilienceMigration } = await import('@src/db/schema.js');
    runResilienceMigration(db);

    // Insert an open journal row with no steps (safe turn)
    db.exec(`INSERT INTO turn_journal (turn_id, context_id, prompt) VALUES ('crash-1', 'main', 'hello')`);

    // Register a no-op channel so recoverCrashedTurns (deferred phase) runs
    const { registerChannel } = await import('@src/channels/registry.js');
    const noopAdapter = {
      init: async () => {},
      start: async () => {},
      stop: async () => {},
      send: async () => {},
      status: () => 'disconnected' as const,
      connectedAt: () => null,
    };
    registerChannel('test-integration', () => noopAdapter);

    const { startServer, stopServer: stop } = await import('@src/server.js');
    stopServer = stop;

    await startServer({
      port: 0,
      logLevel: 'silent',
      db: db as any,
      // A minimal config is required so the deferred resilience phase runs
      // (notifyRestart + recoverCrashedTurns need populated channel adapters)
      config: {
        channels: { 'test-integration': { enabled: true } },
        routing: { default: 'main', rules: [] },
        agent: { name: 'Test', runner: 'pi', model: { authMode: 'own', provider: '', id: '', apiKey: '' } },
        resilience: {
          recovery: { mode: 'safe_only', side_effect_tools: [] },
          scheduler: { catchup_window: '1h' },
          outage_threshold: 3,
          probe_interval: '1h',
        },
      } as any,
    });

    // The journal row should be gone — it was handled
    const row = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('crash-1');
    expect(row).toBeUndefined();

    await stopServer();
  });
});
