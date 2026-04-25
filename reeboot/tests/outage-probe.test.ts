import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

async function makeDb() {
  const { runResilienceMigration, runMigration } = await import('@src/db/schema.js');
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
  return db;
}

function makeAdapter() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
  } as any;
}

function insertOutage(db: InstanceType<typeof Database>, lostJobs: any[] = []) {
  const id = 'outage-1';
  db.prepare(
    `INSERT INTO outage_events (id, provider, lost_jobs) VALUES (?, 'anthropic', ?)`
  ).run(id, JSON.stringify(lostJobs));
  return id;
}

function insertProbeTask(db: InstanceType<typeof Database>) {
  const id = 'probe-task-1';
  db.prepare(
    `INSERT INTO tasks (id, context_id, schedule, schedule_type, schedule_value, normalized_ms, status, prompt, next_run)
     VALUES (?, '__outage_probe__', '1h', 'interval', 'every 1h', 3600000, 'active', '__probe__', datetime('now', '+1 hour'))`
  ).run(id);
  return id;
}

describe('outage probe and resolution', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('does not resolve outage when probe fetch returns 500', async () => {
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus } = await import('@src/channels/interface.js');
    const db = await makeDb();
    insertOutage(db);
    const probeTaskId = insertProbeTask(db);

    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const adapter = makeAdapter();
    const orc = new Orchestrator(
      { routing: { default: 'main', rules: [] }, resilience: { outage_threshold: 3, probe_interval: '1h', recovery: { mode: 'safe_only', side_effect_tools: [] }, scheduler: { catchup_window: '1h' } } } as any,
      new MessageBus(),
      new Map([['web', adapter]]),
      new Map(),
      db
    );

    // Simulate active outage state
    (orc as any)._activeOutage = true;

    await orc.handleScheduledTask({ taskId: probeTaskId, contextId: '__outage_probe__', prompt: '' });

    const outage = db.prepare('SELECT * FROM outage_events WHERE id = ?').get('outage-1') as any;
    expect(outage.resolved_at).toBeNull();
    const probe = db.prepare('SELECT * FROM tasks WHERE id = ?').get(probeTaskId);
    expect(probe).toBeTruthy();
  });

  it('resolves outage after 2 consecutive probe successes', async () => {
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus } = await import('@src/channels/interface.js');
    const db = await makeDb();
    insertOutage(db, [{ contextId: 'main', prompt: 'do something' }]);
    const probeTaskId = insertProbeTask(db);

    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const adapter = makeAdapter();
    const orc = new Orchestrator(
      { routing: { default: 'main', rules: [] }, resilience: { outage_threshold: 3, probe_interval: '1h', recovery: { mode: 'safe_only', side_effect_tools: [] }, scheduler: { catchup_window: '1h' } } } as any,
      new MessageBus(),
      new Map([['web', adapter]]),
      new Map(),
      db
    );
    (orc as any)._activeOutage = true;

    // First success — not yet resolved
    await orc.handleScheduledTask({ taskId: probeTaskId, contextId: '__outage_probe__', prompt: '' });
    const outageAfterFirst = db.prepare('SELECT * FROM outage_events WHERE id = ?').get('outage-1') as any;
    expect(outageAfterFirst.resolved_at).toBeNull();

    // Second success — now resolved
    await orc.handleScheduledTask({ taskId: probeTaskId, contextId: '__outage_probe__', prompt: '' });
    const outageAfterSecond = db.prepare('SELECT * FROM outage_events WHERE id = ?').get('outage-1') as any;
    expect(outageAfterSecond.resolved_at).not.toBeNull();

    // Probe task deleted
    const probeAfter = db.prepare('SELECT * FROM tasks WHERE id = ?').get(probeTaskId);
    expect(probeAfter).toBeUndefined();

    // Broadcast sent with recovery message
    expect(adapter.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'text', text: expect.stringMatching(/recover|back online/i) })
    );
  });

  it('resets probe success count after a failed probe', async () => {
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus } = await import('@src/channels/interface.js');
    const db = await makeDb();
    insertOutage(db);
    const probeTaskId = insertProbeTask(db);

    // success, then fail, then success, then success -> resolves on 3rd+4th attempt
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 })  // 1st: success (count=1)
      .mockResolvedValueOnce({ ok: false, status: 500 })  // 2nd: fail (count reset)
      .mockResolvedValueOnce({ ok: true, status: 200 })  // 3rd: success (count=1)
      .mockResolvedValueOnce({ ok: true, status: 200 }); // 4th: success (count=2) → resolve

    const adapter = makeAdapter();
    const orc = new Orchestrator(
      { routing: { default: 'main', rules: [] }, resilience: { outage_threshold: 3, probe_interval: '1h', recovery: { mode: 'safe_only', side_effect_tools: [] }, scheduler: { catchup_window: '1h' } } } as any,
      new MessageBus(),
      new Map([['web', adapter]]),
      new Map(),
      db
    );
    (orc as any)._activeOutage = true;

    for (let i = 0; i < 3; i++) {
      await orc.handleScheduledTask({ taskId: probeTaskId, contextId: '__outage_probe__', prompt: '' });
    }
    const outage3 = db.prepare('SELECT * FROM outage_events WHERE id = ?').get('outage-1') as any;
    expect(outage3.resolved_at).toBeNull();

    await orc.handleScheduledTask({ taskId: probeTaskId, contextId: '__outage_probe__', prompt: '' });
    const outage4 = db.prepare('SELECT * FROM outage_events WHERE id = ?').get('outage-1') as any;
    expect(outage4.resolved_at).not.toBeNull();
  });

  it('broadcast on resolution lists lost jobs', async () => {
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus } = await import('@src/channels/interface.js');
    const db = await makeDb();
    insertOutage(db, [
      { contextId: 'main', prompt: 'summarise my emails' },
      { contextId: 'main', prompt: 'check the weather' },
      { contextId: 'main', prompt: 'remind me at 5pm' },
    ]);
    const probeTaskId = insertProbeTask(db);

    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const adapter = makeAdapter();
    const orc = new Orchestrator(
      { routing: { default: 'main', rules: [] } } as any,
      new MessageBus(),
      new Map([['web', adapter]]),
      new Map(),
      db
    );
    (orc as any)._activeOutage = true;

    // Two successes to trigger resolution
    await orc.handleScheduledTask({ taskId: probeTaskId, contextId: '__outage_probe__', prompt: '' });
    await orc.handleScheduledTask({ taskId: probeTaskId, contextId: '__outage_probe__', prompt: '' });

    const broadcastCalls = (adapter.send as ReturnType<typeof vi.fn>).mock.calls;
    const recoveryCall = broadcastCalls.find((c: any[]) =>
      /recover|back online/i.test(c[1]?.text ?? '')
    );
    expect(recoveryCall).toBeDefined();
    expect(recoveryCall![1].text).toContain('summarise my emails');
    expect(recoveryCall![1].text).toContain('check the weather');
  });

  it('advances probe task next_run on failed probe', async () => {
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus } = await import('@src/channels/interface.js');
    const db = await makeDb();
    insertOutage(db);
    const probeTaskId = insertProbeTask(db);

    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const adapter = makeAdapter();
    const orc = new Orchestrator(
      { routing: { default: 'main', rules: [] }, resilience: { outage_threshold: 3, probe_interval: '1h', recovery: { mode: 'safe_only', side_effect_tools: [] }, scheduler: { catchup_window: '1h' } } } as any,
      new MessageBus(),
      new Map([['web', adapter]]),
      new Map(),
      db
    );
    (orc as any)._activeOutage = true;

    const before = db.prepare('SELECT next_run FROM tasks WHERE id = ?').get(probeTaskId) as any;
    const beforeTime = new Date(before.next_run).getTime();

    await orc.handleScheduledTask({ taskId: probeTaskId, contextId: '__outage_probe__', prompt: '' });

    const after = db.prepare('SELECT next_run FROM tasks WHERE id = ?').get(probeTaskId) as any;
    const afterTime = new Date(after.next_run).getTime();
    // next_run should be advanced (≥ 1h from now, so > beforeTime)
    expect(afterTime).toBeGreaterThan(beforeTime);
  });

  it('recovery broadcast mentions truncation when lost_jobs were capped', async () => {
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus } = await import('@src/channels/interface.js');
    const db = await makeDb();

    // Build 20 lost jobs and set truncated=1 directly
    const lostJobs = Array.from({ length: 20 }, (_, i) => ({ contextId: 'main', prompt: `req-${i}` }));
    const outageId = 'outage-trunc';
    db.prepare(
      `INSERT INTO outage_events (id, provider, lost_jobs, truncated) VALUES (?, 'anthropic', ?, 1)`
    ).run(outageId, JSON.stringify(lostJobs));
    const probeTaskId = insertProbeTask(db);

    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const adapter = makeAdapter();
    const orc = new Orchestrator(
      { routing: { default: 'main', rules: [] }, resilience: { outage_threshold: 3, probe_interval: '1h', recovery: { mode: 'safe_only', side_effect_tools: [] }, scheduler: { catchup_window: '1h' } } } as any,
      new MessageBus(),
      new Map([['web', adapter]]),
      new Map(),
      db
    );
    (orc as any)._activeOutage = true;

    // Two successes to trigger resolution
    await orc.handleScheduledTask({ taskId: probeTaskId, contextId: '__outage_probe__', prompt: '' });
    await orc.handleScheduledTask({ taskId: probeTaskId, contextId: '__outage_probe__', prompt: '' });

    const broadcastCalls = (adapter.send as ReturnType<typeof vi.fn>).mock.calls;
    const recoveryCall = broadcastCalls.find((c: any[]) =>
      /recover|back online/i.test(c[1]?.text ?? '')
    );
    expect(recoveryCall).toBeDefined();
    // Broadcast must note that the list was truncated
    expect(recoveryCall![1].text).toMatch(/truncat|…|not captured/i);
  });

  it('probe task is handled without invoking the agent runner', async () => {
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus } = await import('@src/channels/interface.js');
    const db = await makeDb();
    insertOutage(db);
    const probeTaskId = insertProbeTask(db);

    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const adapter = makeAdapter();
    // A runner with a prompt spy — it must NOT be called during probe handling
    const runnerPromptSpy = vi.fn();
    const fakeRunner = {
      prompt: runnerPromptSpy,
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const orc = new Orchestrator(
      { routing: { default: 'main', rules: [] }, resilience: { outage_threshold: 3, probe_interval: '1h', recovery: { mode: 'safe_only', side_effect_tools: [] }, scheduler: { catchup_window: '1h' } } } as any,
      new MessageBus(),
      new Map([['web', adapter]]),
      new Map([['main', fakeRunner as any]]),
      db
    );
    (orc as any)._activeOutage = true;

    await orc.handleScheduledTask({ taskId: probeTaskId, contextId: '__outage_probe__', prompt: '' });

    expect(runnerPromptSpy).not.toHaveBeenCalled();
  });

  it('no active outage — no probe task exists in tasks table', async () => {
    const db = await makeDb();
    // No outage declared, no insertOutage/insertProbeTask called
    const probeTasks = db.prepare(`SELECT * FROM tasks WHERE context_id = '__outage_probe__'`).all();
    expect(probeTasks).toHaveLength(0);
  });
});
