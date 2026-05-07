/**
 * OB-1-E: warn+ pino log records must be persisted to the operational_logs table.
 *
 * The logger must write warn, error, and fatal records to operational_logs in SQLite.
 * Info and debug records must NOT be written.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runResilienceMigration, runObservabilityMigration } from '@src/db/schema.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runResilienceMigration(db);
  runObservabilityMigration(db);
  return db;
}

describe('OB-1-E: operational_logs persist warn+ pino records', () => {
  it('warn log is written to operational_logs', async () => {
    const { createLogger } = await import('@src/observability/logger.js');
    const db = makeDb();
    const logger = createLogger({ level: 'debug' }, db);

    logger.warn({ component: 'test' }, 'test-warn-message');

    // Give the Writable stream time to flush
    await new Promise(r => setTimeout(r, 50));

    const row = db.prepare(
      "SELECT * FROM operational_logs WHERE msg = 'test-warn-message'"
    ).get() as any;
    expect(row).toBeDefined();
    expect(row.level).toBe(40); // pino warn level
    expect(row.component).toBe('test');
  });

  it('error log is written to operational_logs', async () => {
    const { createLogger } = await import('@src/observability/logger.js');
    const db = makeDb();
    const logger = createLogger({ level: 'debug' }, db);

    logger.error({ component: 'test' }, 'test-error-message');

    await new Promise(r => setTimeout(r, 50));

    const row = db.prepare(
      "SELECT * FROM operational_logs WHERE msg = 'test-error-message'"
    ).get() as any;
    expect(row).toBeDefined();
    expect(row.level).toBe(50); // pino error level
  });

  it('info log is NOT written to operational_logs', async () => {
    const { createLogger } = await import('@src/observability/logger.js');
    const db = makeDb();
    const logger = createLogger({ level: 'debug' }, db);

    logger.info({ component: 'test' }, 'test-info-message');

    await new Promise(r => setTimeout(r, 50));

    const row = db.prepare(
      "SELECT * FROM operational_logs WHERE msg = 'test-info-message'"
    ).get();
    expect(row).toBeUndefined();
  });

  it('debug log is NOT written to operational_logs', async () => {
    const { createLogger } = await import('@src/observability/logger.js');
    const db = makeDb();
    const logger = createLogger({ level: 'debug' }, db);

    logger.debug({ component: 'test' }, 'test-debug-message');

    await new Promise(r => setTimeout(r, 50));

    const row = db.prepare(
      "SELECT * FROM operational_logs WHERE msg = 'test-debug-message'"
    ).get();
    expect(row).toBeUndefined();
  });
});
