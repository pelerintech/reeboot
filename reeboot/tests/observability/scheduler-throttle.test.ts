import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration, runResilienceMigration, runObservabilityMigration } from '@src/db/schema.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
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
      id TEXT PRIMARY KEY, context_id TEXT NOT NULL DEFAULT 'main',
      schedule TEXT NOT NULL DEFAULT '', prompt TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active', next_run TEXT
    )
  `);
  runMigration(db);
  runResilienceMigration(db);
  runObservabilityMigration(db);
  return db;
}

describe('Scheduler throttling on retry-after', () => {
  it('skips task dispatch when retry_after_ms is active and emits scheduler_throttled event', async () => {
    vi.resetModules();
    const { Scheduler } = await import('@src/scheduler.js');
    const db = makeDb();

    // Insert a rate_limits row with retry_after_ms set to 60 seconds from now
    db.prepare(`
      INSERT INTO rate_limits (id, context_id, provider, remaining_tokens, retry_after_ms, recorded_at)
      VALUES ('rl-1', 'main', 'test-provider', 100, 60000, datetime('now'))
    `).run();

    // Insert a task that is due now
    db.prepare(`
      INSERT INTO tasks (id, context_id, schedule, schedule_type, schedule_value, prompt, status, next_run)
      VALUES ('task-1', 'main', '* * * * *', 'cron', '* * * * *', 'do something', 'active', datetime('now', '-1 minutes'))
    `).run();

    const handleScheduledTask = vi.fn();
    const orchestrator = { handleScheduledTask };
    const scheduler = new Scheduler(db, orchestrator as any, { provider: 'test-provider' });

    // Manually invoke one poll cycle
    await (scheduler as any)._poll();

    // Task should NOT have been dispatched
    expect(handleScheduledTask).not.toHaveBeenCalled();

    // A scheduler_throttled event should be in the events table
    const event = db.prepare("SELECT * FROM events WHERE type = 'scheduler_throttled'").get() as any;
    expect(event).toBeDefined();
    expect(JSON.parse(event.payload)).toHaveProperty('task_id', 'task-1');
  });

  it('does NOT skip when retry_after has expired', async () => {
    vi.resetModules();
    const { Scheduler } = await import('@src/scheduler.js');
    const db = makeDb();

    // Insert a rate_limits row that has already expired (recorded 2 minutes ago, retry_after 60s)
    db.prepare(`
      INSERT INTO rate_limits (id, context_id, provider, remaining_tokens, retry_after_ms, recorded_at)
      VALUES ('rl-2', 'main', 'test-provider', 100, 60000, datetime('now', '-2 minutes'))
    `).run();

    // Insert a task due now
    db.prepare(`
      INSERT INTO tasks (id, context_id, schedule, schedule_type, schedule_value, prompt, status, next_run)
      VALUES ('task-2', 'main', '* * * * *', 'cron', '* * * * *', 'do something', 'active', datetime('now', '-1 minutes'))
    `).run();

    const handleScheduledTask = vi.fn().mockResolvedValue(undefined);
    const orchestrator = { handleScheduledTask };
    const scheduler = new Scheduler(db, orchestrator as any, { provider: 'test-provider' });

    await (scheduler as any)._poll();

    expect(handleScheduledTask).toHaveBeenCalled();
  });

  it('does NOT skip when no rate_limits row exists for provider', async () => {
    vi.resetModules();
    const { Scheduler } = await import('@src/scheduler.js');
    const db = makeDb();

    db.prepare(`
      INSERT INTO tasks (id, context_id, schedule, schedule_type, schedule_value, prompt, status, next_run)
      VALUES ('task-3', 'main', '* * * * *', 'cron', '* * * * *', 'do something', 'active', datetime('now', '-1 minutes'))
    `).run();

    const handleScheduledTask = vi.fn().mockResolvedValue(undefined);
    const orchestrator = { handleScheduledTask };
    const scheduler = new Scheduler(db, orchestrator as any, { provider: 'test-provider' });

    await (scheduler as any)._poll();

    expect(handleScheduledTask).toHaveBeenCalled();
  });
});
