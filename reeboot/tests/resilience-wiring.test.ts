/**
 * Server crash-recovery wiring (socket-free via buildApp + migrated temp db).
 * Verifies notifyRestart / recoverCrashedTurns fire AFTER channels are init.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { openDatabase, closeDb } from '../src/db/index.js';
import { runResilienceMigration } from '../src/db/schema.js';
import type Database from 'better-sqlite3';

function resetDb() { try { closeDb(); } catch { /* ignore */ } }

afterEach(async () => {
  try {
    const { stopServer } = await import('../src/server.js');
    await stopServer();
  } catch { /* already stopped */ }
  resetDb();
});

function makeMockAdapter() {
  const sendSpy = vi.fn().mockResolvedValue(undefined);
  return {
    adapter: {
      init: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      send: sendSpy,
      status: vi.fn().mockReturnValue('connected' as const),
      connectedAt: vi.fn().mockReturnValue(null),
    },
    sendSpy,
  };
}

const MINIMAL_CONFIG = {
  channels: { 'test-notify': { enabled: true } },
  routing: { default: 'main', rules: [] },
  agent: {
    name: 'Test',
    runner: 'pi',
    model: { authMode: 'own', provider: '', id: '', apiKey: '', providers: [] },
  },
  resilience: {
    recovery: { mode: 'safe_only', side_effect_tools: [] },
    scheduler: { catchup_window: '1h' },
    outage_threshold: 3,
    probe_interval: '1h',
  },
} as const;

async function runApp(db: Database.Database, reebotDir: string, config: any) {
  const mod: any = await import('../src/server.js');
  await mod.buildApp({ db, reebotDir, config });
}

async function makeHost() {
  const reebotDir = mkdtempSync(join(tmpdir(), 'reeboot-wiring-'));
  const db = openDatabase(join(reebotDir, 'reeboot.db'));
  db.exec(`CREATE TABLE IF NOT EXISTS reeboot_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  return { db, reebotDir };
}

describe('server.ts crash-recovery wiring', () => {
  it('restart notification reaches the adapter after channel initialisation', async () => {
    const { db, reebotDir } = await makeHost();
    db.prepare(`INSERT INTO reeboot_state (key, value) VALUES ('last_started_at', datetime('now', '-1 hour'))`).run();

    const { registerChannel } = await import('../src/channels/registry.js');
    const { sendSpy, adapter } = makeMockAdapter();
    registerChannel('test-notify', () => adapter);

    await runApp(db, reebotDir, MINIMAL_CONFIG);

    const restartCall = sendSpy.mock.calls.find((c: any[]) => /restarted/i.test(c[1]?.text ?? ''));
    expect(restartCall).toBeDefined();
  });

  it('crash-recovery notification reaches the adapter with an open safe journal', async () => {
    const { db, reebotDir } = await makeHost();
    runResilienceMigration(db);
    db.exec(`INSERT INTO turn_journal (turn_id, context_id, prompt) VALUES ('crash-wiring-1', 'main', 'summarize daily news')`);

    const { registerChannel } = await import('../src/channels/registry.js');
    const { sendSpy, adapter } = makeMockAdapter();
    registerChannel('test-notify', () => adapter);

    await runApp(db, reebotDir, MINIMAL_CONFIG);

    const recoveryCall = sendSpy.mock.calls.find((c: any[]) => /restarted|interrupted|re-running/i.test(c[1]?.text ?? ''));
    expect(recoveryCall).toBeDefined();

    const row = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('crash-wiring-1');
    expect(row).toBeUndefined();
  });

  it('requeueFn publishes a recovery message to the orchestrator bus', async () => {
    const { db, reebotDir } = await makeHost();
    runResilienceMigration(db);
    db.exec(`INSERT INTO turn_journal (turn_id, context_id, prompt) VALUES ('requeue-test-1', 'main', 'run daily briefing')`);

    const { registerChannel } = await import('../src/channels/registry.js');
    const { sendSpy, adapter } = makeMockAdapter();
    registerChannel('test-notify', () => adapter);

    const alwaysConfig = {
      ...MINIMAL_CONFIG,
      resilience: {
        ...MINIMAL_CONFIG.resilience,
        recovery: { mode: 'always', side_effect_tools: [] },
      },
    };

    await runApp(db, reebotDir, alwaysConfig);

    const rerunCall = sendSpy.mock.calls.find((c: any[]) => /re-running|re.run/i.test(c[1]?.text ?? ''));
    expect(rerunCall).toBeDefined();

    const row = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('requeue-test-1');
    expect(row).toBeUndefined();
  });
});
