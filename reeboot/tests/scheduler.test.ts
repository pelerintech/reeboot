/**
 * Scheduler tests — Phase 2 rewrite (TDD)
 *
 * Tests the new poll-loop scheduler, schedule parser, task-run-log,
 * task-management-tools, and tasks-due-command.
 *
 * Test groups 1.2–1.6 are written first (RED) before any implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

// ─── DB helpers ───────────────────────────────────────────────────────────────

function makeLegacyDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model_provider TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      context_id TEXT NOT NULL REFERENCES contexts(id),
      schedule TEXT NOT NULL,
      prompt TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare("INSERT INTO contexts (id, name) VALUES ('main', 'main')").run();
  return db;
}

function makeFullDb(): Database.Database {
  const db = makeLegacyDb();
  // Apply migration immediately so we have a full-schema DB
  db.exec(`
    ALTER TABLE tasks ADD COLUMN schedule_type TEXT NOT NULL DEFAULT 'cron';
    ALTER TABLE tasks ADD COLUMN schedule_value TEXT NOT NULL DEFAULT '';
    ALTER TABLE tasks ADD COLUMN normalized_ms INTEGER;
    ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
    ALTER TABLE tasks ADD COLUMN next_run TEXT;
    ALTER TABLE tasks ADD COLUMN last_result TEXT;
    ALTER TABLE tasks ADD COLUMN context_mode TEXT NOT NULL DEFAULT 'shared';
    CREATE TABLE IF NOT EXISTS task_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      run_at TEXT NOT NULL DEFAULT (datetime('now')),
      duration_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT
    );
  `);
  return db;
}

function insertTask(db: Database.Database, overrides: Record<string, any> = {}) {
  const defaults = {
    id: 'task-1',
    context_id: 'main',
    schedule: '* * * * *',
    prompt: 'Test prompt',
    enabled: 1,
    last_run: null,
    schedule_type: 'cron',
    schedule_value: '* * * * *',
    normalized_ms: null,
    status: 'active',
    next_run: new Date(Date.now() - 1000).toISOString(), // due 1s ago
    last_result: null,
    context_mode: 'shared',
  };
  const row = { ...defaults, ...overrides };
  db.prepare(`
    INSERT INTO tasks (id, context_id, schedule, prompt, enabled, last_run,
      schedule_type, schedule_value, normalized_ms, status, next_run, last_result, context_mode)
    VALUES (@id, @context_id, @schedule, @prompt, @enabled, @last_run,
      @schedule_type, @schedule_value, @normalized_ms, @status, @next_run, @last_result, @context_mode)
  `).run(row);
}

// ─── 1.2: Schedule Parser tests ───────────────────────────────────────────────

describe('schedule-parser: detectScheduleType', () => {
  let detectScheduleType: (v: string) => { type: string; normalizedMs?: number };

  beforeEach(async () => {
    const mod = await import('@src/scheduler/parse.js');
    detectScheduleType = mod.detectScheduleType;
  });

  it('ISO datetime detected as once', () => {
    const result = detectScheduleType('2026-04-01T09:00:00Z');
    expect(result.type).toBe('once');
  });

  it('ISO datetime with offset detected as once', () => {
    const result = detectScheduleType('2026-04-01T09:00:00+05:00');
    expect(result.type).toBe('once');
  });

  it('alias "hourly" detected as interval with 3600000ms', () => {
    const result = detectScheduleType('hourly');
    expect(result.type).toBe('interval');
    expect(result.normalizedMs).toBe(3_600_000);
  });

  it('alias "daily" detected as interval with 86400000ms', () => {
    const result = detectScheduleType('daily');
    expect(result.type).toBe('interval');
    expect(result.normalizedMs).toBe(86_400_000);
  });

  it('alias "weekly" detected as interval', () => {
    const result = detectScheduleType('weekly');
    expect(result.type).toBe('interval');
    expect(result.normalizedMs).toBe(7 * 86_400_000);
  });

  it('"every 30m" detected as interval with 1800000ms', () => {
    const result = detectScheduleType('every 30m');
    expect(result.type).toBe('interval');
    expect(result.normalizedMs).toBe(1_800_000);
  });

  it('"every 2h" detected as interval with 7200000ms', () => {
    const result = detectScheduleType('every 2h');
    expect(result.type).toBe('interval');
    expect(result.normalizedMs).toBe(7_200_000);
  });

  it('"every 1d" detected as interval with 86400000ms', () => {
    const result = detectScheduleType('every 1d');
    expect(result.type).toBe('interval');
    expect(result.normalizedMs).toBe(86_400_000);
  });

  it('"every 1m" detected as interval with 60000ms', () => {
    const result = detectScheduleType('every 1m');
    expect(result.type).toBe('interval');
    expect(result.normalizedMs).toBe(60_000);
  });

  it('"0 9 * * *" detected as cron', () => {
    const result = detectScheduleType('0 9 * * *');
    expect(result.type).toBe('cron');
    expect(result.normalizedMs).toBeUndefined();
  });

  it('"0 9 * * 1-5" detected as cron', () => {
    const result = detectScheduleType('0 9 * * 1-5');
    expect(result.type).toBe('cron');
  });

  it('invalid string throws error', () => {
    expect(() => detectScheduleType('not-a-schedule')).toThrow();
  });

  it('invalid string error is descriptive', () => {
    expect(() => detectScheduleType('not-a-schedule')).toThrowError(/invalid|not-a-schedule/i);
  });
});

describe('schedule-parser: computeNextRun', () => {
  let computeNextRun: (task: any) => string | null;

  beforeEach(async () => {
    const mod = await import('@src/scheduler/parse.js');
    computeNextRun = mod.computeNextRun;
  });

  it('once task returns null', () => {
    const task = { schedule_type: 'once', schedule_value: '2026-04-01T09:00:00Z', normalized_ms: null, next_run: null };
    expect(computeNextRun(task)).toBeNull();
  });

  it('cron task returns next future ISO string', () => {
    const task = { schedule_type: 'cron', schedule_value: '0 9 * * *', normalized_ms: null, next_run: null };
    const result = computeNextRun(task);
    expect(result).not.toBeNull();
    expect(new Date(result!).getTime()).toBeGreaterThan(Date.now());
    // Should be some 9am occurrence
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('interval advances by fixed ms', () => {
    // next_run is "2026-01-01T08:00:00Z", current time is "2026-01-01T10:30:00Z"
    // normalized_ms = 3600000 (1h)
    // Should skip 08:00, 09:00, 10:00 -> first future slot is 11:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:30:00Z'));
    const task = {
      schedule_type: 'interval',
      schedule_value: 'hourly',
      normalized_ms: 3_600_000,
      next_run: '2026-01-01T08:00:00Z',
    };
    const result = computeNextRun(task);
    expect(result).toBe('2026-01-01T11:00:00.000Z');
    vi.useRealTimers();
  });

  it('interval skips multiple missed ticks to first future time', () => {
    vi.useFakeTimers();
    // 3 hours overdue with 1-hour interval
    const baseTime = new Date('2026-01-01T10:00:00Z');
    vi.setSystemTime(baseTime);
    const task = {
      schedule_type: 'interval',
      schedule_value: 'hourly',
      normalized_ms: 3_600_000,
      next_run: '2026-01-01T07:00:00Z', // 3h overdue
    };
    const result = computeNextRun(task);
    const resultMs = new Date(result!).getTime();
    expect(resultMs).toBeGreaterThan(Date.now());
    vi.useRealTimers();
  });
});

// ─── 1.3: Task-poll-loop tests ────────────────────────────────────────────────

describe('task-poll-loop', () => {
  let Scheduler: any;
  let db: Database.Database;
  let orchestrator: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    db = makeFullDb();
    orchestrator = { handleScheduledTask: vi.fn().mockResolvedValue(undefined) };
    const mod = await import('@src/scheduler.js');
    Scheduler = mod.Scheduler;
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  it('due task is dispatched on poll', async () => {
    insertTask(db, {
      id: 'due-1',
      status: 'active',
      next_run: new Date(Date.now() - 5000).toISOString(),
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();

    // Let one poll run
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    expect(orchestrator.handleScheduledTask).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'due-1' })
    );
  });

  it('non-due task (future next_run) is not dispatched', async () => {
    insertTask(db, {
      id: 'future-1',
      status: 'active',
      next_run: new Date(Date.now() + 600_000).toISOString(), // 10 min future
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    expect(orchestrator.handleScheduledTask).not.toHaveBeenCalled();
  });

  it('paused task is not dispatched even if next_run is due', async () => {
    insertTask(db, {
      id: 'paused-1',
      status: 'paused',
      next_run: new Date(Date.now() - 5000).toISOString(),
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    expect(orchestrator.handleScheduledTask).not.toHaveBeenCalled();
  });

  it('completed task is not dispatched', async () => {
    insertTask(db, {
      id: 'done-1',
      status: 'completed',
      next_run: new Date(Date.now() - 5000).toISOString(),
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    expect(orchestrator.handleScheduledTask).not.toHaveBeenCalled();
  });

  it('multiple due tasks run concurrently in same poll', async () => {
    // Track call order via artificial delay
    const callOrder: string[] = [];
    orchestrator.handleScheduledTask = vi.fn().mockImplementation(async (task: any) => {
      callOrder.push(task.taskId);
    });

    for (const id of ['t-a', 't-b', 't-c']) {
      insertTask(db, { id, status: 'active', next_run: new Date(Date.now() - 1000).toISOString() });
    }

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    expect(orchestrator.handleScheduledTask).toHaveBeenCalledTimes(3);
    expect(callOrder).toHaveLength(3);
    expect(callOrder).toContain('t-a');
    expect(callOrder).toContain('t-b');
    expect(callOrder).toContain('t-c');
  });

  it('one failing task does not block others', async () => {
    orchestrator.handleScheduledTask = vi.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('task error')))
      .mockResolvedValue(undefined);

    for (const id of ['fail-1', 'ok-2', 'ok-3']) {
      insertTask(db, { id, status: 'active', next_run: new Date(Date.now() - 1000).toISOString() });
    }

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    expect(orchestrator.handleScheduledTask).toHaveBeenCalledTimes(3);
  });

  it('once task is marked completed after running', async () => {
    insertTask(db, {
      id: 'once-1',
      schedule_type: 'once',
      status: 'active',
      next_run: new Date(Date.now() - 1000).toISOString(),
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    const row = db.prepare("SELECT status FROM tasks WHERE id = 'once-1'").get() as any;
    expect(row.status).toBe('completed');
  });

  it('once task does not run again on second poll', async () => {
    insertTask(db, {
      id: 'once-2',
      schedule_type: 'once',
      status: 'active',
      next_run: new Date(Date.now() - 1000).toISOString(),
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();

    // Run two poll ticks
    await vi.advanceTimersByTimeAsync(300);
    scheduler.stop();

    // Should only be called once even though 2 ticks ran
    expect(orchestrator.handleScheduledTask).toHaveBeenCalledTimes(1);
  });

  it('cron task next_run is updated after firing', async () => {
    const originalNextRun = new Date(Date.now() - 5000).toISOString();
    insertTask(db, {
      id: 'cron-upd',
      schedule_type: 'cron',
      schedule_value: '* * * * *',
      status: 'active',
      next_run: originalNextRun,
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    const row = db.prepare("SELECT next_run FROM tasks WHERE id = 'cron-upd'").get() as any;
    expect(row.next_run).not.toBe(originalNextRun);
    expect(new Date(row.next_run).getTime()).toBeGreaterThan(Date.now());
  });

  it('interval task next_run updated drift-free', async () => {
    // Was due 10 minutes ago; interval is 1 hour
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    insertTask(db, {
      id: 'interval-upd',
      schedule_type: 'interval',
      schedule_value: 'hourly',
      normalized_ms: 3_600_000,
      status: 'active',
      next_run: tenMinutesAgo,
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    const row = db.prepare("SELECT next_run FROM tasks WHERE id = 'interval-upd'").get() as any;
    // next_run should be ~50 minutes from now (was 10 min ago + 60 min = 50 min future)
    const nextRunMs = new Date(row.next_run).getTime();
    expect(nextRunMs).toBeGreaterThan(Date.now());
  });

  it('DB migration: legacy task survives migration', async () => {
    // Use a legacy DB (no new columns)
    const legacyDb = makeLegacyDb();
    legacyDb.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt, enabled) VALUES ('legacy-1', 'main', '* * * * *', 'Legacy task', 1)"
    ).run();

    const { runMigration } = await import('@src/db/schema.js');
    runMigration(legacyDb);

    // After migration, task should have new columns with defaults
    const row = legacyDb.prepare("SELECT * FROM tasks WHERE id = 'legacy-1'").get() as any;
    expect(row.schedule_type).toBe('cron');
    expect(row.status).toBe('active');
    expect(row.context_mode).toBe('shared');
    expect(row.next_run).not.toBeNull(); // computed from cron expression

    legacyDb.close();
  });

  it('DB migration is idempotent (safe to run twice)', async () => {
    const legacyDb = makeLegacyDb();
    const { runMigration } = await import('@src/db/schema.js');

    // Should not throw when run twice
    expect(() => {
      runMigration(legacyDb);
      runMigration(legacyDb);
    }).not.toThrow();

    legacyDb.close();
  });
});

// ─── 1.4: Task-run-log tests ──────────────────────────────────────────────────

describe('task-run-log', () => {
  let Scheduler: any;
  let db: Database.Database;
  let orchestrator: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    db = makeFullDb();
    orchestrator = { handleScheduledTask: vi.fn().mockResolvedValue(undefined) };
    const mod = await import('@src/scheduler.js');
    Scheduler = mod.Scheduler;
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  it('successful run inserts task_runs row with status success', async () => {
    orchestrator.handleScheduledTask = vi.fn().mockResolvedValue('Hello, I checked your emails.');

    insertTask(db, {
      id: 'run-log-1',
      status: 'active',
      next_run: new Date(Date.now() - 1000).toISOString(),
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    const runs = db.prepare("SELECT * FROM task_runs WHERE task_id = 'run-log-1'").all() as any[];
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0].status).toBe('success');
    expect(runs[0].error).toBeNull();
  });

  it('failed run inserts task_runs row with status error', async () => {
    orchestrator.handleScheduledTask = vi.fn().mockRejectedValue(new Error('AgentRunner timeout'));

    insertTask(db, {
      id: 'run-log-fail',
      status: 'active',
      next_run: new Date(Date.now() - 1000).toISOString(),
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    const runs = db.prepare("SELECT * FROM task_runs WHERE task_id = 'run-log-fail'").all() as any[];
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0].status).toBe('error');
    expect(runs[0].error).toContain('AgentRunner timeout');
    expect(runs[0].result).toBeNull();
  });

  it('result truncated to last 200 chars', async () => {
    const longOutput = 'x'.repeat(500);
    orchestrator.handleScheduledTask = vi.fn().mockResolvedValue(longOutput);

    insertTask(db, {
      id: 'run-log-trunc',
      status: 'active',
      next_run: new Date(Date.now() - 1000).toISOString(),
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    const runs = db.prepare("SELECT * FROM task_runs WHERE task_id = 'run-log-trunc'").all() as any[];
    expect(runs[0].result.length).toBe(200);
  });

  it('last_result updated on tasks row after success', async () => {
    orchestrator.handleScheduledTask = vi.fn().mockResolvedValue('Done!');

    insertTask(db, {
      id: 'run-log-lr',
      status: 'active',
      next_run: new Date(Date.now() - 1000).toISOString(),
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    const task = db.prepare("SELECT last_result FROM tasks WHERE id = 'run-log-lr'").get() as any;
    expect(task.last_result).toBe('Done!');
  });

  it('last_result updated on tasks row after failure', async () => {
    orchestrator.handleScheduledTask = vi.fn().mockRejectedValue(new Error('timeout!'));

    insertTask(db, {
      id: 'run-log-lr-fail',
      status: 'active',
      next_run: new Date(Date.now() - 1000).toISOString(),
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    const task = db.prepare("SELECT last_result FROM tasks WHERE id = 'run-log-lr-fail'").get() as any;
    expect(task.last_result).toContain('timeout!');
  });

  it('task_runs row has valid duration_ms', async () => {
    orchestrator.handleScheduledTask = vi.fn().mockResolvedValue('ok');

    insertTask(db, {
      id: 'run-log-dur',
      status: 'active',
      next_run: new Date(Date.now() - 1000).toISOString(),
    });

    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    await vi.advanceTimersByTimeAsync(200);
    scheduler.stop();

    const runs = db.prepare("SELECT * FROM task_runs WHERE task_id = 'run-log-dur'").all() as any[];
    expect(typeof runs[0].duration_ms).toBe('number');
    expect(runs[0].duration_ms).toBeGreaterThanOrEqual(0);
  });
});

// ─── 1.5: Task-management-tools tests ────────────────────────────────────────

describe('task-management-tools', () => {
  let createSchedulerTools: any;
  let db: Database.Database;
  let scheduler: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00Z'));
    db = makeFullDb();
    scheduler = { registerJob: vi.fn(), cancelJob: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const mod = await import('@src/scheduler.js');
    createSchedulerTools = mod.createSchedulerTools;
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  it('schedule_task with interval creates task with correct fields', async () => {
    const tools = createSchedulerTools(db, scheduler);
    const result = await tools.schedule_task({ schedule: 'every 30m', prompt: 'check emails' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Scheduled');

    const row = db.prepare("SELECT * FROM tasks WHERE prompt = 'check emails'").get() as any;
    expect(row).toBeDefined();
    expect(row.schedule_type).toBe('interval');
    expect(row.normalized_ms).toBe(1_800_000);
    expect(row.status).toBe('active');
    expect(row.next_run).not.toBeNull();
  });

  it('schedule_task with cron creates task with correct fields', async () => {
    const tools = createSchedulerTools(db, scheduler);
    const result = await tools.schedule_task({ schedule: '0 9 * * *', prompt: 'morning report' });
    expect(result.isError).toBeFalsy();

    const row = db.prepare("SELECT * FROM tasks WHERE prompt = 'morning report'").get() as any;
    expect(row.schedule_type).toBe('cron');
    expect(row.schedule_value).toBe('0 9 * * *');
  });

  it('schedule_task with ISO datetime creates once task', async () => {
    const tools = createSchedulerTools(db, scheduler);
    const result = await tools.schedule_task({ schedule: '2026-03-21T17:00:00Z', prompt: 'Friday summary' });
    expect(result.isError).toBeFalsy();

    const row = db.prepare("SELECT * FROM tasks WHERE prompt = 'Friday summary'").get() as any;
    expect(row.schedule_type).toBe('once');
    expect(row.next_run).toBe('2026-03-21T17:00:00Z');
  });

  it('schedule_task with invalid schedule returns error, no row created', async () => {
    const tools = createSchedulerTools(db, scheduler);
    const result = await tools.schedule_task({ schedule: 'not-a-schedule', prompt: 'bad task' });
    expect(result.isError).toBe(true);

    const row = db.prepare("SELECT * FROM tasks WHERE prompt = 'bad task'").get();
    expect(row).toBeUndefined();
  });

  it('schedule_task with context_mode=isolated stores it', async () => {
    const tools = createSchedulerTools(db, scheduler);
    await tools.schedule_task({ schedule: 'hourly', prompt: 'price check', context_mode: 'isolated' });

    const row = db.prepare("SELECT * FROM tasks WHERE prompt = 'price check'").get() as any;
    expect(row.context_mode).toBe('isolated');
  });

  it('pause_task sets status to paused', async () => {
    insertTask(db, { id: 'pause-t', status: 'active' });
    const tools = createSchedulerTools(db, scheduler);
    const result = await tools.pause_task({ task_id: 'pause-t' });
    expect(result.isError).toBeFalsy();

    const row = db.prepare("SELECT status FROM tasks WHERE id = 'pause-t'").get() as any;
    expect(row.status).toBe('paused');
  });

  it('resume_task sets status to active and recomputes next_run', async () => {
    insertTask(db, {
      id: 'resume-t',
      status: 'paused',
      schedule_type: 'interval',
      schedule_value: 'hourly',
      normalized_ms: 3_600_000,
      next_run: '2026-01-01T00:00:00Z', // stale
    });
    const tools = createSchedulerTools(db, scheduler);
    const result = await tools.resume_task({ task_id: 'resume-t' });
    expect(result.isError).toBeFalsy();

    const row = db.prepare("SELECT status, next_run FROM tasks WHERE id = 'resume-t'").get() as any;
    expect(row.status).toBe('active');
    // next_run should be recomputed to future
    expect(new Date(row.next_run).getTime()).toBeGreaterThan(Date.now());
  });

  it('pause_task on unknown id returns error', async () => {
    const tools = createSchedulerTools(db, scheduler);
    const result = await tools.pause_task({ task_id: 'nonexistent' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('resume_task on unknown id returns error', async () => {
    const tools = createSchedulerTools(db, scheduler);
    const result = await tools.resume_task({ task_id: 'nonexistent' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('update_task changes schedule and recomputes next_run', async () => {
    const oldNextRun = '2026-01-01T00:00:00Z';
    insertTask(db, {
      id: 'upd-t',
      status: 'active',
      schedule_type: 'interval',
      schedule_value: 'hourly',
      normalized_ms: 3_600_000,
      next_run: oldNextRun,
    });
    const tools = createSchedulerTools(db, scheduler);
    const result = await tools.update_task({ task_id: 'upd-t', schedule: 'every 2h' });
    expect(result.isError).toBeFalsy();

    const row = db.prepare("SELECT * FROM tasks WHERE id = 'upd-t'").get() as any;
    expect(row.normalized_ms).toBe(7_200_000);
    expect(row.next_run).not.toBe(oldNextRun);
  });

  it('update_task changes prompt only, schedule unchanged', async () => {
    insertTask(db, {
      id: 'upd-p',
      status: 'active',
      schedule_type: 'cron',
      schedule_value: '0 9 * * *',
      next_run: new Date(Date.now() + 3600_000).toISOString(),
    });
    const tools = createSchedulerTools(db, scheduler);
    const result = await tools.update_task({ task_id: 'upd-p', prompt: 'new prompt text' });
    expect(result.isError).toBeFalsy();

    const row = db.prepare("SELECT * FROM tasks WHERE id = 'upd-p'").get() as any;
    expect(row.prompt).toBe('new prompt text');
    expect(row.schedule_value).toBe('0 9 * * *'); // unchanged
  });

  it('update_task on unknown id returns error', async () => {
    const tools = createSchedulerTools(db, scheduler);
    const result = await tools.update_task({ task_id: 'nonexistent', prompt: 'test' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('list_tasks overdue task shows nextRun: "overdue"', async () => {
    insertTask(db, {
      id: 'list-overdue',
      status: 'active',
      next_run: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
    });
    const tools = createSchedulerTools(db, scheduler);
    const result = await tools.list_tasks({});
    const tasks = result.details.tasks as any[];
    const t = tasks.find((t: any) => t.id === 'list-overdue');
    expect(t).toBeDefined();
    expect(t.nextRun).toBe('overdue');
  });

  it('list_tasks future task shows relative time', async () => {
    insertTask(db, {
      id: 'list-future',
      status: 'active',
      next_run: new Date(Date.now() + 23 * 60 * 1000).toISOString(), // 23 min future
    });
    const tools = createSchedulerTools(db, scheduler);
    const result = await tools.list_tasks({});
    const tasks = result.details.tasks as any[];
    const t = tasks.find((t: any) => t.id === 'list-future');
    expect(t).toBeDefined();
    expect(t.nextRun).toMatch(/in \d+ minute/);
  });
});

// ─── 1.6: Tasks-due-command tests ────────────────────────────────────────────

describe('tasks-due-command', () => {
  let db: Database.Database;
  let getTasksDue: (db: Database.Database) => any[];
  let formatTasksDue: (tasks: any[]) => string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00Z'));
    db = makeFullDb();
    const mod = await import('@src/scheduler.js');
    getTasksDue = mod.getTasksDue;
    formatTasksDue = mod.formatTasksDue;
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  it('getTasksDue returns overdue active tasks', () => {
    insertTask(db, {
      id: 'due-cmd-1',
      prompt: 'Task one',
      status: 'active',
      next_run: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    });
    insertTask(db, {
      id: 'due-cmd-2',
      prompt: 'Task two',
      status: 'active',
      next_run: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });

    const due = getTasksDue(db);
    expect(due.length).toBe(2);
    expect(due.map((t: any) => t.id)).toContain('due-cmd-1');
    expect(due.map((t: any) => t.id)).toContain('due-cmd-2');
  });

  it('getTasksDue does not return future tasks', () => {
    insertTask(db, {
      id: 'due-cmd-future',
      status: 'active',
      next_run: new Date(Date.now() + 60_000).toISOString(),
    });

    const due = getTasksDue(db);
    expect(due.map((t: any) => t.id)).not.toContain('due-cmd-future');
  });

  it('getTasksDue does not return paused tasks', () => {
    insertTask(db, {
      id: 'due-cmd-paused',
      status: 'paused',
      next_run: new Date(Date.now() - 1000).toISOString(),
    });

    const due = getTasksDue(db);
    expect(due.map((t: any) => t.id)).not.toContain('due-cmd-paused');
  });

  it('formatTasksDue returns "No overdue tasks." when empty', () => {
    expect(formatTasksDue([])).toBe('No overdue tasks.');
  });

  it('formatTasksDue includes task id and prompt for overdue tasks', () => {
    const tasks = [{
      id: 'task-abc',
      prompt: 'Check the weather forecast for tomorrow',
      schedule_value: 'hourly',
      next_run: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    }];
    const output = formatTasksDue(tasks);
    expect(output).toContain('task-abc');
    expect(output).toContain('Check the weather forecast');
  });
});

// ─── Backward compat: existing registerJob / cancelJob API ───────────────────

describe('Scheduler backward-compat API', () => {
  let Scheduler: any;
  let db: Database.Database;
  let orchestrator: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    db = makeFullDb();
    orchestrator = { handleScheduledTask: vi.fn().mockResolvedValue(undefined) };
    const mod = await import('@src/scheduler.js');
    Scheduler = mod.Scheduler;
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
  });

  it('registerJob() still works', () => {
    insertTask(db, { id: 'compat-1', status: 'active', next_run: new Date(Date.now() + 3600_000).toISOString() });
    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    // Should not throw
    expect(() => scheduler.registerJob({ id: 'compat-1', contextId: 'main', schedule: '* * * * *', prompt: 'test' })).not.toThrow();
  });

  it('cancelJob() removes task from DB', () => {
    insertTask(db, { id: 'cancel-compat', status: 'active', next_run: new Date(Date.now() + 3600_000).toISOString() });
    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    scheduler.cancelJob('cancel-compat');

    const row = db.prepare("SELECT * FROM tasks WHERE id = 'cancel-compat'").get();
    expect(row).toBeUndefined();
  });

  it('stop() cleanly stops poll loop', async () => {
    const scheduler = new Scheduler(db, orchestrator, { intervalMs: 100 });
    await scheduler.start();
    expect(() => scheduler.stop()).not.toThrow();
  });
});
