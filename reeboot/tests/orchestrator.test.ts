/**
 * Orchestrator tests (task 4.1) — TDD red
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageBus, createIncomingMessage } from '@src/channels/interface.js';
import type { IncomingMessage } from '@src/channels/interface.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMsg(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return createIncomingMessage({
    channelType: 'whatsapp',
    peerId: 'peer1@s.whatsapp.net',
    content: 'Hello',
    raw: {},
    ...overrides,
  });
}

function makeConfig(overrides: any = {}) {
  return {
    routing: {
      default: 'main',
      rules: [],
    },
    session: {
      inactivityTimeout: 14_400_000,
    },
    ...overrides,
  } as any;
}

function makeRunner(responseText = 'Agent reply') {
  const runner = {
    prompt: vi.fn().mockImplementation(async (_content: string, onEvent: any) => {
      onEvent({ type: 'text_delta', delta: responseText });
      onEvent({ type: 'message_end', runId: 'r1', usage: { input: 10, output: 5 } });
    }),
    abort: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
  };
  return runner;
}

function makeAdapter() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue('connected'),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Orchestrator routing', () => {
  let bus: MessageBus;
  let adapter: ReturnType<typeof makeAdapter>;
  let runner: ReturnType<typeof makeRunner>;
  let Orchestrator: any;

  beforeEach(async () => {
    vi.resetModules();
    ({ Orchestrator } = await import('@src/orchestrator.js'));
    bus = new MessageBus();
    adapter = makeAdapter();
    runner = makeRunner();
  });

  it('dispatches to default context when no rules match', async () => {
    const runners = new Map([['main', runner]]);
    const adapters = new Map([['whatsapp', adapter]]);
    const orc = new Orchestrator(makeConfig(), bus, adapters, runners);
    orc.start();

    bus.publish(makeMsg());
    await new Promise(r => setTimeout(r, 20));

    expect(runner.prompt).toHaveBeenCalledWith(expect.stringContaining('Hello'), expect.any(Function));
  });

  it('peer match takes highest priority over channel match and default', async () => {
    const peerRunner = makeRunner('peer reply');
    const channelRunner = makeRunner('channel reply');
    const defaultRunner = makeRunner('default reply');

    const runners = new Map([
      ['peer-ctx', peerRunner],
      ['channel-ctx', channelRunner],
      ['main', defaultRunner],
    ]);

    const config = makeConfig({
      routing: {
        default: 'main',
        rules: [
          { peer: 'peer1@s.whatsapp.net', context: 'peer-ctx' },
          { channel: 'whatsapp', context: 'channel-ctx' },
        ],
      },
    });

    const orc = new Orchestrator(config, bus, new Map([['whatsapp', adapter]]), runners);
    orc.start();

    bus.publish(makeMsg({ peerId: 'peer1@s.whatsapp.net' }));
    await new Promise(r => setTimeout(r, 20));

    expect(peerRunner.prompt).toHaveBeenCalled();
    expect(channelRunner.prompt).not.toHaveBeenCalled();
    expect(defaultRunner.prompt).not.toHaveBeenCalled();
  });

  it('channel match used when no peer match', async () => {
    const channelRunner = makeRunner();
    const defaultRunner = makeRunner();

    const runners = new Map([
      ['channel-ctx', channelRunner],
      ['main', defaultRunner],
    ]);

    const config = makeConfig({
      routing: {
        default: 'main',
        rules: [
          { channel: 'whatsapp', context: 'channel-ctx' },
        ],
      },
    });

    const orc = new Orchestrator(config, bus, new Map([['whatsapp', adapter]]), runners);
    orc.start();

    bus.publish(makeMsg({ peerId: 'unknown@s.whatsapp.net' }));
    await new Promise(r => setTimeout(r, 20));

    expect(channelRunner.prompt).toHaveBeenCalled();
    expect(defaultRunner.prompt).not.toHaveBeenCalled();
  });

  it('response is sent back via originating channel adapter', async () => {
    const runners = new Map([['main', runner]]);
    const adapters = new Map([['whatsapp', adapter]]);
    const orc = new Orchestrator(makeConfig(), bus, adapters, runners);
    orc.start();

    bus.publish(makeMsg());
    await new Promise(r => setTimeout(r, 20));

    expect(adapter.send).toHaveBeenCalledWith(
      'peer1@s.whatsapp.net',
      { type: 'text', text: 'Agent reply' }
    );
  });

  it('busy context sends please-wait reply', async () => {
    // Make runner take a long time
    const slowRunner = {
      prompt: vi.fn().mockImplementation(() => new Promise(r => setTimeout(r, 500))),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const runners = new Map([['main', slowRunner]]);
    const adapters = new Map([['whatsapp', adapter]]);
    const orc = new Orchestrator(makeConfig(), bus, adapters, runners);
    orc.start();

    // First message starts the turn
    bus.publish(makeMsg({ content: 'First' }));
    await new Promise(r => setTimeout(r, 10));

    // Second message arrives while busy
    bus.publish(makeMsg({ content: 'Second' }));
    await new Promise(r => setTimeout(r, 10));

    expect(adapter.send).toHaveBeenCalledWith(
      'peer1@s.whatsapp.net',
      { type: 'text', text: "I'm still working on your last request. Please wait." }
    );
  });

  it('queue limit sends queue full reply', async () => {
    const slowRunner = {
      prompt: vi.fn().mockImplementation(() => new Promise(r => setTimeout(r, 500))),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const runners = new Map([['main', slowRunner]]);
    const adapters = new Map([['whatsapp', adapter]]);
    const orc = new Orchestrator(makeConfig(), bus, adapters, runners);
    orc.start();

    bus.publish(makeMsg({ content: 'First' }));
    await new Promise(r => setTimeout(r, 5));

    // Fill queue (max 5)
    for (let i = 0; i < 5; i++) {
      bus.publish(makeMsg({ content: `Queued ${i}` }));
    }
    await new Promise(r => setTimeout(r, 5));

    // This one exceeds the queue
    bus.publish(makeMsg({ content: 'Overflow' }));
    await new Promise(r => setTimeout(r, 10));

    const queueFullCall = adapter.send.mock.calls.find(
      (c: any[]) => c[1]?.text?.includes('queue full') || c[1]?.text?.includes('Queue full')
    );
    expect(queueFullCall).toBeDefined();
  });

  it('queued message is processed after turn completes', async () => {
    let resolveFirst!: () => void;
    const firstPromise = new Promise<void>(r => { resolveFirst = r; });

    const slowRunner = {
      prompt: vi.fn()
        .mockImplementationOnce(async (_c: string, onEvent: any) => {
          await firstPromise;
          onEvent({ type: 'text_delta', delta: 'First done' });
          onEvent({ type: 'message_end', runId: 'r1', usage: { input: 1, output: 1 } });
        })
        .mockImplementationOnce(async (_c: string, onEvent: any) => {
          onEvent({ type: 'text_delta', delta: 'Second done' });
          onEvent({ type: 'message_end', runId: 'r2', usage: { input: 1, output: 1 } });
        }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const runners = new Map([['main', slowRunner]]);
    const adapters = new Map([['whatsapp', adapter]]);
    const orc = new Orchestrator(makeConfig(), bus, adapters, runners);
    orc.start();

    bus.publish(makeMsg({ content: 'First' }));
    await new Promise(r => setTimeout(r, 10));

    bus.publish(makeMsg({ content: 'Second' }));
    await new Promise(r => setTimeout(r, 10));

    // Resolve first turn
    resolveFirst();
    await new Promise(r => setTimeout(r, 30));

    // Both turns should have been called
    expect(slowRunner.prompt).toHaveBeenCalledTimes(2);
  });
});

// ─── Turn Journal ─────────────────────────────────────────────────────────────

describe('turn journal', () => {
  it('inserts a turn_journal row during the turn and deletes it on success', async () => {
    vi.resetModules();
    const Database = (await import('better-sqlite3')).default;
    const { runResilienceMigration } = await import('@src/db/schema.js');
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus } = await import('@src/channels/interface.js');

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, schedule TEXT NOT NULL, prompt TEXT NOT NULL)`);
    runResilienceMigration(db);

    let journalRowDuringTurn: any = null;

    const runner = {
      prompt: vi.fn().mockImplementation(async (_content: string, onEvent: any) => {
        // Check that journal row exists while the turn is running
        journalRowDuringTurn = db.prepare('SELECT * FROM turn_journal').get();
        onEvent({ type: 'text_delta', delta: 'done' });
      }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = makeAdapter();
    const bus = new MessageBus();
    const orc = new Orchestrator(makeConfig(), bus, new Map([['whatsapp', adapter]]), new Map([['main', runner]]), db);
    orc.start();

    bus.publish(makeMsg({ content: 'test prompt' }));
    await new Promise(r => setTimeout(r, 30));

    // Row existed during the turn
    expect(journalRowDuringTurn).toBeTruthy();
    expect(journalRowDuringTurn.status).toBe('open');

    // Row was deleted after success
    const afterRow = db.prepare('SELECT * FROM turn_journal').get();
    expect(afterRow).toBeUndefined();
  });

  it('leaves the turn_journal row open when the runner rejects', async () => {
    vi.resetModules();
    const Database = (await import('better-sqlite3')).default;
    const { runResilienceMigration } = await import('@src/db/schema.js');
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus } = await import('@src/channels/interface.js');

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, schedule TEXT NOT NULL, prompt TEXT NOT NULL)`);
    runResilienceMigration(db);

    const errorRunner = {
      prompt: vi.fn().mockRejectedValue(new Error('provider down')),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = makeAdapter();
    const bus = new MessageBus();
    const orc = new Orchestrator(makeConfig(), bus, new Map([['whatsapp', adapter]]), new Map([['main', errorRunner]]), db);
    orc.start();

    bus.publish(makeMsg({ content: 'crash me' }));
    await new Promise(r => setTimeout(r, 30));

    const row = db.prepare('SELECT * FROM turn_journal').get() as any;
    expect(row).toBeTruthy();
    expect(row.status).toBe('open');
  });
});

// ─── Outage detection ─────────────────────────────────────────────────────────

describe('outage detection', () => {
  async function makeOutageSetup(threshold = 3) {
    vi.resetModules();
    const Database = (await import('better-sqlite3')).default;
    const { runResilienceMigration, runMigration } = await import('@src/db/schema.js');
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus } = await import('@src/channels/interface.js');

    const db = new Database(':memory:');
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
        id TEXT PRIMARY KEY, context_id TEXT NOT NULL, schedule TEXT NOT NULL DEFAULT '',
        prompt TEXT NOT NULL DEFAULT ''
      )
    `);
    runMigration(db);
    runResilienceMigration(db);

    const providerError = Object.assign(new Error('provider unavailable'), { status: 503 });
    const errorRunner = {
      prompt: vi.fn().mockRejectedValue(providerError),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = makeAdapter();
    const bus = new MessageBus();
    const config = makeConfig({
      agent: { turnTimeout: 5000, rateLimitRetries: 0, _testBackoffMs: 0 },
      resilience: {
        outage_threshold: threshold,
        probe_interval: '1h',
        recovery: { mode: 'safe_only', side_effect_tools: [] },
        scheduler: { catchup_window: '1h' },
      },
    });

    const orc = new Orchestrator(config, bus, new Map([['whatsapp', adapter]]), new Map([['main', errorRunner]]), db);
    return { orc, bus, db, adapter, errorRunner };
  }

  it('does not declare outage before threshold is reached', async () => {
    const { orc, bus, db } = await makeOutageSetup(3);
    orc.start();

    // Send 2 messages (below threshold of 3)
    for (let i = 0; i < 2; i++) {
      bus.publish(makeMsg({ content: `fail ${i}` }));
      await new Promise(r => setTimeout(r, 30));
    }

    const outages = db.prepare('SELECT * FROM outage_events').all();
    expect(outages).toHaveLength(0);
  });

  it('declares outage on reaching threshold, creates probe task, broadcasts', async () => {
    const { orc, bus, db, adapter } = await makeOutageSetup(3);
    orc.start();

    // Send 3 messages (exactly at threshold)
    for (let i = 0; i < 3; i++) {
      bus.publish(makeMsg({ content: `fail ${i}` }));
      await new Promise(r => setTimeout(r, 30));
    }

    const outages = db.prepare('SELECT * FROM outage_events').all() as any[];
    expect(outages).toHaveLength(1);
    expect(outages[0].resolved_at).toBeNull();

    const probeTasks = db.prepare(`SELECT * FROM tasks WHERE context_id = '__outage_probe__'`).all();
    expect(probeTasks).toHaveLength(1);

    expect(adapter.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'text', text: expect.stringMatching(/outage/i) })
    );
  });

  it('resets failure counter after a successful turn', async () => {
    vi.resetModules();
    const Database = (await import('better-sqlite3')).default;
    const { runResilienceMigration, runMigration } = await import('@src/db/schema.js');
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus } = await import('@src/channels/interface.js');

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL, model_provider TEXT NOT NULL DEFAULT '', model_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    db.exec(`INSERT INTO contexts (id, name) VALUES ('main', 'main')`);
    db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, schedule TEXT NOT NULL DEFAULT '', prompt TEXT NOT NULL DEFAULT '')`);
    runMigration(db);
    runResilienceMigration(db);

    const providerError = Object.assign(new Error('provider down'), { status: 503 });
    let callCount = 0;
    const mixedRunner = {
      prompt: vi.fn().mockImplementation(async (_content: string, onEvent: any) => {
        callCount++;
        if (callCount === 1 || callCount === 2) throw providerError;
        // Call 3 is a success — resets counter
        onEvent({ type: 'text_delta', delta: 'ok' });
        // Calls 4, 5, 6 are failures but should NOT trigger outage (counter reset)
      }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = makeAdapter();
    const bus = new MessageBus();
    const orc = new Orchestrator(
      makeConfig({ agent: { turnTimeout: 5000, rateLimitRetries: 0, _testBackoffMs: 0 }, resilience: { outage_threshold: 3, probe_interval: '1h', recovery: { mode: 'safe_only', side_effect_tools: [] }, scheduler: { catchup_window: '1h' } } }),
      bus, new Map([['whatsapp', adapter]]), new Map([['main', mixedRunner]]), db
    );
    orc.start();

    // 2 failures
    for (let i = 0; i < 2; i++) {
      bus.publish(makeMsg({ content: `fail ${i}` }));
      await new Promise(r => setTimeout(r, 30));
    }
    // 1 success — resets counter
    bus.publish(makeMsg({ content: 'success' }));
    await new Promise(r => setTimeout(r, 30));

    // 2 more failures — counter starts fresh, not at 3
    for (let i = 0; i < 2; i++) {
      bus.publish(makeMsg({ content: `fail again ${i}` }));
      await new Promise(r => setTimeout(r, 30));
    }

    const outages = db.prepare('SELECT * FROM outage_events').all();
    expect(outages).toHaveLength(0);
  });

  it('non-provider errors do not count toward outage threshold', async () => {
    const { orc, bus, db } = await makeOutageSetup(3);

    // Replace the error runner with one that throws a plain tool error (no .status)
    vi.resetModules();
    const Database2 = (await import('better-sqlite3')).default;
    const { runResilienceMigration: rrm2, runMigration: rm2 } = await import('@src/db/schema.js');
    const { Orchestrator: Orc2 } = await import('@src/orchestrator.js');
    const { MessageBus: MB2 } = await import('@src/channels/interface.js');

    const db2 = new Database2(':memory:');
    db2.exec(`CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL, model_provider TEXT NOT NULL DEFAULT '', model_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    db2.exec(`INSERT INTO contexts (id, name) VALUES ('main', 'main')`);
    db2.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, schedule TEXT NOT NULL DEFAULT '', prompt TEXT NOT NULL DEFAULT '')`);
    rm2(db2);
    rrm2(db2);

    // Plain tool error — no .status, no network code
    const toolError = new Error('tool execution failed');
    const toolErrRunner = {
      prompt: vi.fn().mockRejectedValue(toolError),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const adapter2 = makeAdapter();
    const bus2 = new MB2();
    const orc2 = new Orc2(
      makeConfig({ agent: { turnTimeout: 5000, rateLimitRetries: 0, _testBackoffMs: 0 }, resilience: { outage_threshold: 3, probe_interval: '1h', recovery: { mode: 'safe_only', side_effect_tools: [] }, scheduler: { catchup_window: '1h' } } }),
      bus2, new Map([['whatsapp', adapter2]]), new Map([['main', toolErrRunner]]), db2
    );
    orc2.start();

    // Send 3 tool-error turns — should NOT trigger outage (non-provider error)
    for (let i = 0; i < 3; i++) {
      bus2.publish(makeMsg({ content: `tool-err ${i}` }));
      await new Promise(r => setTimeout(r, 30));
    }

    const outages2 = db2.prepare('SELECT * FROM outage_events').all();
    expect(outages2).toHaveLength(0);

    // Also assert no outage broadcast was sent
    const outageCall = (adapter2.send as ReturnType<typeof vi.fn>).mock.calls
      .find((c: any[]) => /outage/i.test(c[1]?.text ?? ''));
    expect(outageCall).toBeUndefined();
  });
});

describe('outage detection — lost jobs', () => {
  async function makeOutageLostJobsSetup() {
    vi.resetModules();
    const Database = (await import('better-sqlite3')).default;
    const { runResilienceMigration, runMigration } = await import('@src/db/schema.js');
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus } = await import('@src/channels/interface.js');

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL, model_provider TEXT NOT NULL DEFAULT '', model_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    db.exec(`INSERT INTO contexts (id, name) VALUES ('main', 'main')`);
    db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, schedule TEXT NOT NULL DEFAULT '', prompt TEXT NOT NULL DEFAULT '')`);
    runMigration(db);
    runResilienceMigration(db);

    const providerError = Object.assign(new Error('provider unavailable'), { status: 503 });
    const errorRunner = {
      prompt: vi.fn().mockRejectedValue(providerError),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = makeAdapter();
    const bus = new MessageBus();
    const config = makeConfig({
      agent: { turnTimeout: 5000, rateLimitRetries: 0, _testBackoffMs: 0 },
      resilience: {
        outage_threshold: 3,
        probe_interval: '1h',
        recovery: { mode: 'safe_only', side_effect_tools: [] },
        scheduler: { catchup_window: '1h' },
      },
    });

    const orc = new Orchestrator(config, bus, new Map([['whatsapp', adapter]]), new Map([['main', errorRunner]]), db);
    return { orc, bus, db, adapter, errorRunner };
  }

  it('failed turn during active outage is recorded as a lost job', async () => {
    const { orc, bus, db } = await makeOutageLostJobsSetup();
    orc.start();

    // Trigger 3 failures to declare outage
    for (let i = 0; i < 3; i++) {
      bus.publish(makeMsg({ content: `fail ${i}` }));
      await new Promise(r => setTimeout(r, 30));
    }
    const outages = db.prepare('SELECT * FROM outage_events').all() as any[];
    expect(outages).toHaveLength(1);

    // Now send another failing turn while outage is active
    bus.publish(makeMsg({ content: 'post-outage request' }));
    await new Promise(r => setTimeout(r, 30));

    const updated = db.prepare('SELECT lost_jobs FROM outage_events WHERE id = ?').get(outages[0].id) as any;
    const lostJobs = JSON.parse(updated.lost_jobs);
    expect(lostJobs.length).toBeGreaterThan(0);
    const found = lostJobs.some((j: any) => j.prompt === 'post-outage request');
    expect(found).toBe(true);
  });

  it('lost jobs are capped at 20 and truncated flag is set', async () => {
    const { orc, bus, db } = await makeOutageLostJobsSetup();
    orc.start();

    // Trigger initial 3 failures to declare outage
    for (let i = 0; i < 3; i++) {
      bus.publish(makeMsg({ content: `fail ${i}` }));
      await new Promise(r => setTimeout(r, 30));
    }
    const outages = db.prepare('SELECT * FROM outage_events').all() as any[];

    // Send 21 failing turns during outage — 20 should be recorded, 21st triggers truncation flag
    for (let i = 0; i < 21; i++) {
      bus.publish(makeMsg({ content: `lost-job-${i}` }));
      await new Promise(r => setTimeout(r, 30));
    }

    const updated = db.prepare('SELECT lost_jobs, truncated FROM outage_events WHERE id = ?').get(outages[0].id) as any;
    const lostJobs = JSON.parse(updated.lost_jobs);
    expect(lostJobs.length).toBe(20);
    expect(updated.truncated).toBe(1);
  });
});

describe('turn journal — additional scenarios', () => {
  it('journal remains open after turn timeout', async () => {
    vi.resetModules();
    const Database = (await import('better-sqlite3')).default;
    const { runResilienceMigration } = await import('@src/db/schema.js');
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus } = await import('@src/channels/interface.js');

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, schedule TEXT NOT NULL, prompt TEXT NOT NULL)`);
    runResilienceMigration(db);

    // Runner that never resolves (simulates a hung turn)
    const hungRunner = {
      prompt: vi.fn().mockImplementation(() => new Promise(() => { /* never resolves */ })),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = makeAdapter();
    const bus = new MessageBus();
    const orc = new Orchestrator(
      makeConfig({ agent: { turnTimeout: 30, rateLimitRetries: 0, _testBackoffMs: 0 } }), // 30ms timeout
      bus,
      new Map([['whatsapp', adapter]]),
      new Map([['main', hungRunner]]),
      db
    );
    orc.start();

    bus.publish(makeMsg({ content: 'this will timeout' }));
    // Wait enough for the 30ms timeout to fire
    await new Promise(r => setTimeout(r, 100));

    const row = db.prepare('SELECT * FROM turn_journal').get() as any;
    expect(row).toBeTruthy();
    expect(row.status).toBe('open');
  });
});
