/**
 * Resilience startup integration (socket-free via buildApp + migrated temp db)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { openDatabase, closeDb } from '../src/db/index.js';
import { runMigration, runResilienceMigration } from '../src/db/schema.js';
import type Database from 'better-sqlite3';

let stopServer: any;

function resetDb() {
  try { closeDb(); } catch { /* ignore */ }
}

afterEach(async () => {
  try { if (stopServer) await stopServer(); } catch { /* ignore */ }
  resetDb();
});

async function makeHost() {
  const reebotDir = mkdtempSync(join(tmpdir(), 'reeboot-resilience-'));
  const db = openDatabase(join(reebotDir, 'reeboot.db'));
  return { db, reebotDir };
}

async function runApp(db: Database.Database, reebotDir: string, config?: any) {
  const mod: any = await import('../src/server.js');
  stopServer = mod.stopServer;
  const app = await mod.buildApp({ db, reebotDir, ...(config ? { config } : {}) });
  return app;
}

describe('resilience integration — server startup', () => {
  it('runs resilience migration tables on startup', async () => {
    const { db, reebotDir } = await makeHost();
    try {
      await runApp(db, reebotDir);
      const tables = (db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table'"
      ).all() as Array<{ name: string }>).map(r => r.name);
      expect(tables).toContain('turn_journal');
      expect(tables).toContain('turn_journal_steps');
      expect(tables).toContain('outage_events');
    } finally { resetDb(); }
  });

  it('applies catchup for overdue tasks within the window', async () => {
    const { db, reebotDir } = await makeHost();
    runMigration(db);
    db.prepare(`INSERT OR IGNORE INTO contexts (id, name) VALUES ('main', 'main')`).run();
    // Insert an overdue task (missed 30m ago, within default 1h window)
    const missedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO tasks (id, context_id, schedule, schedule_type, schedule_value, normalized_ms, status, prompt, next_run)
      VALUES ('catchup-task', 'main', 'every 1h', 'interval', 'every 1h', 3600000, 'active', 'catchup test', ?)
    `).run(missedAt);

    try {
      await runApp(db, reebotDir, {
        resilience: { recovery: { mode: 'safe_only', side_effect_tools: [] }, scheduler: { catchup_window: '1h' }, outage_threshold: 3, probe_interval: '1h' },
      });
      const task = db.prepare('SELECT next_run FROM tasks WHERE id = ?').get('catchup-task') as any;
      expect(new Date(task.next_run).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    } finally { resetDb(); }
  });

  it('deletes open crash-journal rows on startup (safe_only mode: safe turn requeued)', async () => {
    const { db, reebotDir } = await makeHost();
    runResilienceMigration(db);
    db.exec(`INSERT INTO turn_journal (turn_id, context_id, prompt) VALUES ('crash-1', 'main', 'hello')`);

    const { registerChannel } = await import('../src/channels/registry.js');
    registerChannel('test-integration', () => ({
      init: async () => {},
      start: async () => {},
      stop: async () => {},
      send: async () => {},
      status: () => 'disconnected' as const,
      connectedAt: () => null,
    }));

    try {
      await runApp(db, reebotDir, {
        channels: { 'test-integration': { enabled: true } },
        routing: { default: 'main', rules: [] },
        agent: { name: 'Test', runner: 'pi', model: { authMode: 'own', provider: '', id: '', apiKey: '', providers: [] } },
        resilience: {
          recovery: { mode: 'safe_only', side_effect_tools: [] },
          scheduler: { catchup_window: '1h' },
          outage_threshold: 3,
          probe_interval: '1h',
        },
      });
      const row = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('crash-1');
      expect(row).toBeUndefined();
    } finally { resetDb(); }
  });
});
