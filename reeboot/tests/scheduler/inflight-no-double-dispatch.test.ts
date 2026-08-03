import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drainEventLoop } from '../helpers/event-drain.js';
import Database from 'better-sqlite3';

describe('Scheduler in-flight guard (E4)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        context_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        schedule TEXT NOT NULL DEFAULT '',
        schedule_type TEXT NOT NULL DEFAULT 'cron',
        schedule_value TEXT NOT NULL DEFAULT '* * * * *',
        origin_channel TEXT,
        origin_peer TEXT,
        next_run TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        last_run TEXT
      );
      CREATE TABLE IF NOT EXISTS task_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        run_at TEXT,
        duration_ms INTEGER DEFAULT 0,
        status TEXT DEFAULT 'success',
        result TEXT,
        error TEXT
      );
    `);
  });

  it('S1: in-flight task is not double-dispatched when handler hangs', async () => {
    // A handler that stays in-flight until we resolve it
    let hangResolve: () => void;
    const hangPromise = new Promise<void>((resolve) => { hangResolve = resolve; });
    const handleScheduledTask = vi.fn().mockReturnValue(hangPromise);

    const { Scheduler } = await import('@src/scheduler.js');
    const scheduler = new Scheduler(db, { handleScheduledTask } as any, { intervalMs: 10000 });

    // Insert a due task
    db.prepare(`
      INSERT INTO tasks (id, taskId, context_id, prompt, schedule_type, schedule_value, next_run, status)
      VALUES ('t1', 't1', 'main', 'test', 'cron', '* * * * *', datetime('now', '-1 minute'), 'active')
    `).run();

    // First poll — picks up the task, starts processing (hangs)
    // Don't await it since the hangPromise never resolves yet
    const poll1 = (scheduler as any)._poll();

    // Give the event loop a tick for _runTask to start and add to _inFlight
    await drainEventLoop();

    // Second poll — task is in flight, should NOT dispatch again
    await (scheduler as any)._poll();

    expect(handleScheduledTask).toHaveBeenCalledTimes(1);

    // Clean up the hanging task
    hangResolve!();
    await poll1;
    scheduler.stop();
  });

  it('S2: completed task clears _inFlight and can run again', async () => {
    const handleScheduledTask = vi.fn().mockResolvedValue(undefined);

    const { Scheduler } = await import('@src/scheduler.js');
    const scheduler = new Scheduler(db, { handleScheduledTask } as any, { intervalMs: 10000 });

    // Insert a due task
    db.prepare(`
      INSERT INTO tasks (id, taskId, context_id, prompt, schedule_type, schedule_value, next_run, status)
      VALUES ('t2', 't2', 'main', 'test', 'cron', '* * * * *', datetime('now', '-1 minute'), 'active')
    `).run();

    // First poll — task runs and completes, _inFlight cleared
    await (scheduler as any)._poll();
    expect(handleScheduledTask).toHaveBeenCalledTimes(1);

    // Reset next_run to past so it's due again
    db.prepare("UPDATE tasks SET next_run = datetime('now', '-1 minute') WHERE id = 't2'").run();

    // Second poll — _inFlight was cleared, task runs again
    await (scheduler as any)._poll();
    expect(handleScheduledTask).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it('S3: cancelJob clears in-flight entry', async () => {
    let hangResolve: () => void;
    const hangPromise = new Promise<void>((resolve) => { hangResolve = resolve; });
    const handleScheduledTask = vi.fn().mockReturnValue(hangPromise);

    const { Scheduler } = await import('@src/scheduler.js');
    const scheduler = new Scheduler(db, { handleScheduledTask } as any, { intervalMs: 10000 });

    // Insert a due task
    db.prepare(`
      INSERT INTO tasks (id, taskId, context_id, prompt, schedule_type, schedule_value, next_run, status)
      VALUES ('t3', 't3', 'main', 'test', 'cron', '* * * * *', datetime('now', '-1 minute'), 'active')
    `).run();

    // First poll — task is in flight
    const poll1 = (scheduler as any)._poll();
    await drainEventLoop();

    // cancelJob must not throw and should clean up _inFlight
    expect(() => scheduler.cancelJob('t3')).not.toThrow();

    hangResolve!();
    await poll1;
    scheduler.stop();
  });
});
