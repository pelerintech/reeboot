/**
 * Spec: warn-only-log-persistence
 * DB log persistence reverts to warn+ (level ≥ 40) only. Info/debug are no longer
 * written to `operational_logs`. This reverses the info+ persistence from
 * web-api-readback.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runResilienceMigration, runObservabilityMigration } from '@src/db/schema.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runResilienceMigration(db);
  runObservabilityMigration(db);
  return db;
}

async function flush() { await new Promise(r => setTimeout(r, 50)); }

describe('warn-only-log-persistence', () => {
  it('S1: warn log is persisted at level 40', async () => {
    const { createLogger } = await import('@src/observability/logger.js');
    const db = makeDb();
    const logger = createLogger({ level: 'debug' }, db);
    logger.warn({ component: 'test' }, 'test-warn');
    await flush();
    const row = db.prepare("SELECT level FROM operational_logs WHERE msg = 'test-warn'").get() as any;
    expect(row).toBeDefined();
    expect(row.level).toBe(40);
  });

  it('S2: error log is persisted at level 50', async () => {
    const { createLogger } = await import('@src/observability/logger.js');
    const db = makeDb();
    const logger = createLogger({ level: 'debug' }, db);
    logger.error({ component: 'test' }, 'test-error');
    await flush();
    const row = db.prepare("SELECT level FROM operational_logs WHERE msg = 'test-error'").get() as any;
    expect(row).toBeDefined();
    expect(row.level).toBe(50);
  });

  it('S3: info log is NOT persisted', async () => {
    const { createLogger } = await import('@src/observability/logger.js');
    const db = makeDb();
    const logger = createLogger({ level: 'debug' }, db);
    logger.info({ component: 'test' }, 'test-info');
    await flush();
    const row = db.prepare("SELECT * FROM operational_logs WHERE msg = 'test-info'").get();
    expect(row).toBeUndefined();
  });

  it('S4: debug log is NOT persisted', async () => {
    const { createLogger } = await import('@src/observability/logger.js');
    const db = makeDb();
    const logger = createLogger({ level: 'debug' }, db);
    logger.debug({ component: 'test' }, 'test-debug');
    await flush();
    const row = db.prepare("SELECT * FROM operational_logs WHERE msg = 'test-debug'").get();
    expect(row).toBeUndefined();
  });
});
