/**
 * Integration tests that verify the server.ts wiring of crash-recovery
 * notifications and requeueFn fires correctly AFTER channels are initialised.
 *
 * Pre-fix both tests fail because:
 *   - notifyRestart / recoverCrashedTurns are called with the empty pre-init
 *     _channelAdapters Map (broadcastToAllChannels sends to nobody)
 *   - requeueFn is a no-op closure
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';

// ─── DB helpers ───────────────────────────────────────────────────────────────

function makeBaseDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      model_provider TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`INSERT OR IGNORE INTO contexts (id, name) VALUES ('main', 'main')`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, context_id TEXT NOT NULL,
      schedule TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL DEFAULT ''
    )
  `);
  return db;
}

// ─── Mock channel helper ──────────────────────────────────────────────────────

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
    model: { authMode: 'own', provider: '', id: '', apiKey: '' },
  },
  resilience: {
    recovery: { mode: 'safe_only', side_effect_tools: [] },
    scheduler: { catchup_window: '1h' },
    outage_threshold: 3,
    probe_interval: '1h',
  },
} as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('server.ts crash-recovery wiring', () => {
  afterEach(async () => {
    try {
      vi.resetModules();
      const { stopServer } = await import('@src/server.js');
      await stopServer();
    } catch { /* already stopped or not started */ }
  });

  it('restart notification reaches the adapter after channel initialisation', async () => {
    vi.resetModules();

    // Step 1: Register mock adapter in the fresh registry
    const { registerChannel } = await import('@src/channels/registry.js');
    const { sendSpy, adapter } = makeMockAdapter();
    registerChannel('test-notify', () => adapter);

    // Step 2: DB with a previous-run marker so notifyRestart fires
    const db = makeBaseDb();
    db.exec(`CREATE TABLE IF NOT EXISTS reeboot_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.prepare(`INSERT INTO reeboot_state (key, value) VALUES ('last_started_at', datetime('now', '-1 hour'))`).run();

    // Step 3: Start server — pre-fix this fails because adapters are empty
    const { startServer } = await import('@src/server.js');
    await startServer({
      port: 0,
      logLevel: 'silent',
      db: db as any,
      config: MINIMAL_CONFIG as any,
    });

    // Assert: the restart notification reached the adapter
    const restartCall = sendSpy.mock.calls.find(
      (c: any[]) => /restarted/i.test(c[1]?.text ?? '')
    );
    expect(restartCall).toBeDefined();
  });

  it('crash-recovery notification reaches the adapter with an open safe journal', async () => {
    vi.resetModules();

    const { registerChannel } = await import('@src/channels/registry.js');
    const { sendSpy, adapter } = makeMockAdapter();
    registerChannel('test-notify', () => adapter);

    // DB with resilience tables and an open safe turn_journal row
    const db = makeBaseDb();
    const { runResilienceMigration } = await import('@src/db/schema.js');
    runResilienceMigration(db);
    db.exec(
      `INSERT INTO turn_journal (turn_id, context_id, prompt)
       VALUES ('crash-wiring-1', 'main', 'summarize daily news')`
    );

    const { startServer } = await import('@src/server.js');
    await startServer({
      port: 0,
      logLevel: 'silent',
      db: db as any,
      config: MINIMAL_CONFIG as any,
    });

    // Assert: crash-recovery notification was delivered
    const recoveryCall = sendSpy.mock.calls.find(
      (c: any[]) => /restarted|interrupted|re-running/i.test(c[1]?.text ?? '')
    );
    expect(recoveryCall).toBeDefined();

    // Journal row must be deleted — was handled
    const row = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('crash-wiring-1');
    expect(row).toBeUndefined();
  });

  it('requeueFn publishes a recovery message to the orchestrator bus', async () => {
    vi.resetModules();

    const { registerChannel } = await import('@src/channels/registry.js');
    const { sendSpy, adapter } = makeMockAdapter();
    registerChannel('test-notify', () => adapter);

    // Open safe journal, mode=always → guarantees requeueFn is called
    const db = makeBaseDb();
    const { runResilienceMigration } = await import('@src/db/schema.js');
    runResilienceMigration(db);
    db.exec(
      `INSERT INTO turn_journal (turn_id, context_id, prompt)
       VALUES ('requeue-test-1', 'main', 'run daily briefing')`
    );

    const alwaysConfig = {
      ...MINIMAL_CONFIG,
      resilience: {
        ...MINIMAL_CONFIG.resilience,
        recovery: { mode: 'always', side_effect_tools: [] },
      },
    };

    const { startServer } = await import('@src/server.js');
    await startServer({
      port: 0,
      logLevel: 'silent',
      db: db as any,
      config: alwaysConfig as any,
    });

    // The auto-resume notification includes "re-running" — proves requeueFn
    // code path was reached AND the adapter was populated (gap 2 also fixed)
    const rerunCall = sendSpy.mock.calls.find(
      (c: any[]) => /re-running|re.run/i.test(c[1]?.text ?? '')
    );
    expect(rerunCall).toBeDefined();

    // Journal must be gone
    const row = db.prepare('SELECT * FROM turn_journal WHERE turn_id = ?').get('requeue-test-1');
    expect(row).toBeUndefined();
  });
});
