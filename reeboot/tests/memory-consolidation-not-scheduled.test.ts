import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

describe('Memory consolidation NOT scheduled (E1-REMOVE)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    // Use full schema so the scheduler's registerJob doesn't fail on missing columns
    db.exec(`
      CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        context_id TEXT NOT NULL,
        schedule TEXT NOT NULL,
        prompt TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        schedule_type TEXT,
        schedule_value TEXT,
        normalized_ms INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        next_run TEXT,
        last_run TEXT,
        last_result TEXT,
        context_mode TEXT DEFAULT 'shared',
        origin_channel TEXT,
        origin_peer TEXT
      );
    `);
    db.prepare("INSERT INTO contexts (id, name) VALUES ('main', 'Main')").run();
  });

  it('S1: no consolidation sentinel task is scheduled', async () => {
    const { Scheduler } = await import('@src/scheduler.js');
    const { bootstrapServerJobs } = await import('@src/bootstrap.js');

    const scheduler = new Scheduler(db, { provider: 'test' });
    await scheduler.start();

    bootstrapServerJobs(db, scheduler, {
      sdk: 'ree',
      memory: { enabled: true, consolidation: { enabled: true, schedule: '0 2 * * *' } },
    });

    const row = db.prepare(
      "SELECT id FROM tasks WHERE prompt LIKE '%__memory_consolidation__%'"
    ).get();
    expect(row).toBeUndefined();

    await scheduler.stop();
  });

  it('S3: runConsolidation remains callable (future pi wiring)', async () => {
    const mod = await import('@src/extensions/memory-manager.js');
    expect(typeof mod.runConsolidation).toBe('function');
  });
});
