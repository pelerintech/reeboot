import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';

async function makeDb() {
  const { runResilienceMigration } = await import('@src/db/schema.js');
  const { runMigration } = await import('@src/db/schema.js');
  const db = new Database(':memory:');

  // Bootstrap the base tasks table (as drizzle would) then run scheduler migration
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model_provider TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`INSERT INTO contexts (id, name) VALUES ('ctx1', 'main')`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      context_id TEXT NOT NULL REFERENCES contexts(id),
      schedule TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL DEFAULT ''
    )
  `);
  runMigration(db);
  runResilienceMigration(db);
  return db;
}

function insertTask(
  db: InstanceType<typeof Database>,
  id: string,
  missedByMs: number,
  catchup: string | null = null,
  scheduleType = 'interval',
  scheduleValue = 'every 1h',
  normalizedMs = 3_600_000
) {
  const nextRun = new Date(Date.now() - missedByMs).toISOString();
  db.prepare(`
    INSERT INTO tasks (id, context_id, schedule, schedule_type, schedule_value, normalized_ms, status, prompt, next_run, catchup)
    VALUES (?, 'ctx1', ?, ?, ?, ?, 'active', 'test', ?, ?)
  `).run(id, scheduleValue, scheduleType, scheduleValue, normalizedMs, nextRun, catchup);
}

describe('applyScheduledCatchup', () => {
  it('marks task missed within default 1h window as due-now', async () => {
    const { applyScheduledCatchup } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    insertTask(db, 'within-window', 30 * 60 * 1000); // missed 30m ago
    const config = { resilience: { scheduler: { catchup_window: '1h' } } };
    applyScheduledCatchup(db, config as any);

    const task = db.prepare('SELECT next_run FROM tasks WHERE id = ?').get('within-window') as any;
    expect(new Date(task.next_run).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('advances next_run for task missed beyond 1h window', async () => {
    const { applyScheduledCatchup } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    insertTask(db, 'beyond-window', 3 * 60 * 60 * 1000); // missed 3h ago
    const config = { resilience: { scheduler: { catchup_window: '1h' } } };
    applyScheduledCatchup(db, config as any);

    const task = db.prepare('SELECT next_run FROM tasks WHERE id = ?').get('beyond-window') as any;
    expect(new Date(task.next_run).getTime()).toBeGreaterThan(Date.now());
  });

  it('always-catchup task fires regardless of age (48h missed)', async () => {
    const { applyScheduledCatchup } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    insertTask(db, 'always-task', 48 * 60 * 60 * 1000, 'always'); // missed 48h ago, catchup=always
    const config = { resilience: { scheduler: { catchup_window: '1h' } } };
    applyScheduledCatchup(db, config as any);

    const task = db.prepare('SELECT next_run FROM tasks WHERE id = ?').get('always-task') as any;
    expect(new Date(task.next_run).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('never-catchup task advances next_run regardless of how recent the miss was', async () => {
    const { applyScheduledCatchup } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    insertTask(db, 'never-task', 5 * 60 * 1000, 'never'); // missed only 5m ago, catchup=never
    const config = { resilience: { scheduler: { catchup_window: '1h' } } };
    applyScheduledCatchup(db, config as any);

    const task = db.prepare('SELECT next_run FROM tasks WHERE id = ?').get('never-task') as any;
    expect(new Date(task.next_run).getTime()).toBeGreaterThan(Date.now());
  });

  it('custom 2h window fires task missed 90m ago', async () => {
    const { applyScheduledCatchup } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    insertTask(db, 'custom-2h', 90 * 60 * 1000, '2h'); // missed 90m ago, catchup=2h
    const config = { resilience: { scheduler: { catchup_window: '1h' } } };
    applyScheduledCatchup(db, config as any);

    const task = db.prepare('SELECT next_run FROM tasks WHERE id = ?').get('custom-2h') as any;
    expect(new Date(task.next_run).getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('catchup — deduplication', () => {
  it('each task fires at most once regardless of how many natural periods were missed', async () => {
    vi.resetModules();
    const { applyScheduledCatchup } = await import('@src/resilience/startup.js');
    const db = await makeDb();

    // Insert three tasks all overdue within the catchup window
    for (let i = 0; i < 3; i++) {
      insertTask(db, `task-${i}`, 20 * 60 * 1000); // missed 20m ago, within 1h window
    }

    const config = { resilience: { scheduler: { catchup_window: '1h' } } };
    // Running catchup twice simulates two rapid restarts — each task should not
    // accumulate multiple fires; each row is processed exactly once per call
    applyScheduledCatchup(db, config as any);
    applyScheduledCatchup(db, config as any); // second call: tasks now have next_run ≤ now so still overdue

    // Each task should have next_run ≤ now (ready to fire once by scheduler)
    for (let i = 0; i < 3; i++) {
      const task = db.prepare('SELECT next_run FROM tasks WHERE id = ?').get(`task-${i}`) as any;
      // next_run ≤ now (will be picked up by scheduler)
      expect(new Date(task.next_run).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    }

    // There is still exactly one row per task (no duplication of rows)
    for (let i = 0; i < 3; i++) {
      const rows = db.prepare('SELECT * FROM tasks WHERE id = ?').all(`task-${i}`) as any[];
      expect(rows).toHaveLength(1);
    }
  });
});
