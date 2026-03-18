/**
 * Scheduler tests (task 2.1) — TDD red
 *
 * Tests the Scheduler class using an in-memory SQLite DB and a mock orchestrator.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock node-cron so we can control when jobs fire
const mockCronJobs = new Map<string, { fn: () => void; stop: () => void }>();
const mockCron = {
  schedule: vi.fn((expression: string, fn: () => void) => {
    const job = {
      fn,
      stop: vi.fn(),
    };
    mockCronJobs.set(expression, job);
    return job;
  }),
  validate: vi.fn((expr: string) => {
    // Simple mock: treat "not-a-cron" as invalid, everything else as valid
    return expr !== 'not-a-cron' && expr !== 'invalid';
  }),
};

vi.mock('node-cron', () => ({
  default: mockCron,
  schedule: mockCron.schedule,
  validate: mockCron.validate,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDb(): Database.Database {
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
  // Insert default context
  db.prepare(
    "INSERT INTO contexts (id, name) VALUES ('main', 'main')"
  ).run();
  return db;
}

function makeOrchestrator() {
  return {
    handleScheduledTask: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Scheduler', () => {
  let Scheduler: any;
  let db: Database.Database;
  let orchestrator: ReturnType<typeof makeOrchestrator>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCronJobs.clear();

    db = makeDb();
    orchestrator = makeOrchestrator();
    const mod = await import('@src/scheduler.js');
    Scheduler = mod.Scheduler;
  });

  afterEach(() => {
    db.close();
  });

  it('enabled task is registered on startup', async () => {
    db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt, enabled) VALUES ('t1', 'main', '0 9 * * *', 'Morning report', 1)"
    ).run();

    const scheduler = new Scheduler(db, orchestrator);
    await scheduler.start();

    expect(mockCron.schedule).toHaveBeenCalledWith('0 9 * * *', expect.any(Function));
  });

  it('disabled task is NOT registered on startup', async () => {
    db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt, enabled) VALUES ('t2', 'main', '0 9 * * *', 'Disabled task', 0)"
    ).run();

    const scheduler = new Scheduler(db, orchestrator);
    await scheduler.start();

    expect(mockCron.schedule).not.toHaveBeenCalled();
  });

  it('cron job fires and dispatches prompt to orchestrator', async () => {
    db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt, enabled) VALUES ('t3', 'main', '* * * * *', 'Hello agent', 1)"
    ).run();

    const scheduler = new Scheduler(db, orchestrator);
    await scheduler.start();

    // Simulate cron job firing
    const job = mockCronJobs.get('* * * * *');
    expect(job).toBeDefined();
    await job!.fn();

    expect(orchestrator.handleScheduledTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 't3',
        contextId: 'main',
        prompt: 'Hello agent',
      })
    );
  });

  it('last_run is updated after task fires', async () => {
    db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt, enabled) VALUES ('t4', 'main', '* * * * *', 'Update me', 1)"
    ).run();

    const scheduler = new Scheduler(db, orchestrator);
    await scheduler.start();

    const job = mockCronJobs.get('* * * * *');
    await job!.fn();

    const task = db.prepare("SELECT last_run FROM tasks WHERE id = 't4'").get() as any;
    expect(task.last_run).not.toBeNull();
    expect(typeof task.last_run).toBe('string');
  });

  it('registerJob() registers a new cron job for a task', async () => {
    const scheduler = new Scheduler(db, orchestrator);
    await scheduler.start();

    // Insert a task and register manually
    db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt, enabled) VALUES ('t5', 'main', '0 8 * * *', 'Morning', 1)"
    ).run();

    scheduler.registerJob({ id: 't5', contextId: 'main', schedule: '0 8 * * *', prompt: 'Morning' });

    expect(mockCron.schedule).toHaveBeenCalledWith('0 8 * * *', expect.any(Function));
  });

  it('cancelJob() stops and removes the cron job', async () => {
    db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt, enabled) VALUES ('t6', 'main', '0 10 * * *', 'Cancel me', 1)"
    ).run();

    const scheduler = new Scheduler(db, orchestrator);
    await scheduler.start();

    const job = mockCronJobs.get('0 10 * * *');
    expect(job).toBeDefined();

    scheduler.cancelJob('t6');

    expect(job!.stop).toHaveBeenCalled();
  });

  it('stop() cancels all registered jobs', async () => {
    db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt, enabled) VALUES ('t7', 'main', '0 11 * * *', 'Stop test', 1)"
    ).run();

    const scheduler = new Scheduler(db, orchestrator);
    await scheduler.start();

    const job = mockCronJobs.get('0 11 * * *');
    scheduler.stop();

    expect(job!.stop).toHaveBeenCalled();
  });
});

// ─── scheduler-tool extension tests ──────────────────────────────────────────

describe('scheduler-tool extension', () => {
  let db: Database.Database;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCronJobs.clear();
    db = makeDb();
  });

  afterEach(() => {
    db.close();
  });

  it('schedule_task inserts row and registers job (valid cron)', async () => {
    const { createSchedulerTools } = await import('@src/scheduler.js');
    const orchestrator = makeOrchestrator();
    const scheduler = { registerJob: vi.fn(), cancelJob: vi.fn() };
    const tools = createSchedulerTools(db, scheduler as any);

    const result = await tools.schedule_task({
      schedule: '0 9 * * 1-5',
      prompt: 'Daily briefing',
      contextId: 'main',
    });

    expect(result.content[0].text).toContain('Scheduled');
    const row = db.prepare("SELECT * FROM tasks WHERE prompt = 'Daily briefing'").get() as any;
    expect(row).toBeDefined();
    expect(scheduler.registerJob).toHaveBeenCalled();
  });

  it('schedule_task returns error for invalid cron expression', async () => {
    const { createSchedulerTools } = await import('@src/scheduler.js');
    const orchestrator = makeOrchestrator();
    const scheduler = { registerJob: vi.fn(), cancelJob: vi.fn() };
    const tools = createSchedulerTools(db, scheduler as any);

    const result = await tools.schedule_task({
      schedule: 'not-a-cron',
      prompt: 'Bad task',
      contextId: 'main',
    });

    expect(result.content[0].text).toContain('Invalid cron expression');
    expect(result.isError).toBe(true);
  });

  it('list_tasks returns all tasks', async () => {
    db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt, enabled) VALUES ('lt1', 'main', '* * * * *', 'List me', 1)"
    ).run();

    const { createSchedulerTools } = await import('@src/scheduler.js');
    const scheduler = { registerJob: vi.fn(), cancelJob: vi.fn() };
    const tools = createSchedulerTools(db, scheduler as any);

    const result = await tools.list_tasks({});
    const text = result.content[0].text;
    expect(text).toContain('lt1');
    expect(text).toContain('List me');
  });

  it('cancel_task removes row and cancels job', async () => {
    db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt, enabled) VALUES ('ct1', 'main', '* * * * *', 'Cancel me', 1)"
    ).run();

    const { createSchedulerTools } = await import('@src/scheduler.js');
    const scheduler = { registerJob: vi.fn(), cancelJob: vi.fn() };
    const tools = createSchedulerTools(db, scheduler as any);

    const result = await tools.cancel_task({ task_id: 'ct1' });
    expect(result.content[0].text).toContain('Cancelled');
    expect(scheduler.cancelJob).toHaveBeenCalledWith('ct1');
    const row = db.prepare("SELECT * FROM tasks WHERE id = 'ct1'").get();
    expect(row).toBeUndefined();
  });

  it('cancel_task returns error for unknown task id', async () => {
    const { createSchedulerTools } = await import('@src/scheduler.js');
    const scheduler = { registerJob: vi.fn(), cancelJob: vi.fn() };
    const tools = createSchedulerTools(db, scheduler as any);

    const result = await tools.cancel_task({ task_id: 'nonexistent' });
    expect(result.content[0].text).toContain('not found');
    expect(result.isError).toBe(true);
  });
});
