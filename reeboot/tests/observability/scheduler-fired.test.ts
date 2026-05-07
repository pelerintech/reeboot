import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigration, runResilienceMigration, runObservabilityMigration } from '@src/db/schema.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL, model_provider TEXT NOT NULL DEFAULT '', model_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec(`INSERT INTO contexts (id, name) VALUES ('main', 'main')`);
  db.exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, context_id TEXT NOT NULL DEFAULT 'main', schedule TEXT NOT NULL DEFAULT '', prompt TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active', next_run TEXT)`);
  runMigration(db);
  runResilienceMigration(db);
  runObservabilityMigration(db);
  return db;
}

describe('OB-2-D: scheduler_fired event', () => {
  it('emits scheduler_fired event when a task is dispatched', async () => {
    vi.resetModules();
    const { Scheduler } = await import('@src/scheduler.js');
    const db = makeDb();

    // Insert a task that is due now
    db.prepare(`
      INSERT INTO tasks (id, context_id, schedule, schedule_type, schedule_value, prompt, status, next_run)
      VALUES ('task-fired', 'main', '* * * * *', 'cron', '* * * * *', 'do work', 'active', datetime('now', '-1 minutes'))
    `).run();

    const handleScheduledTask = vi.fn().mockResolvedValue(undefined);
    const scheduler = new Scheduler(db, { handleScheduledTask } as any);

    await (scheduler as any)._poll();

    const event = db.prepare("SELECT * FROM events WHERE type = 'scheduler_fired'").get() as any;
    expect(event).toBeDefined();
    const payload = JSON.parse(event.payload);
    expect(payload).toHaveProperty('taskId', 'task-fired');
    expect(payload).toHaveProperty('contextId', 'main');
  });
});
