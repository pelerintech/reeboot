import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-db-test-'));
  dbPath = join(tmpDir, 'test.db');
});

afterEach(async () => {
  const mod = await import('@src/db/index.js');
  try { mod.closeDb(); } catch { /* already closed */ }
  // Reset module singleton between tests
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openDatabase()', () => {
  it('creates database file on first run', async () => {
    const { openDatabase } = await import('@src/db/index.js');
    const { existsSync } = await import('fs');
    openDatabase(dbPath);
    expect(existsSync(dbPath)).toBe(true);
  });

  it('all 5 tables are present after schema push', async () => {
    const { openDatabase } = await import('@src/db/index.js');
    const db = openDatabase(dbPath);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('contexts');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('channels');
    expect(tableNames).toContain('usage');
  });

  it('existing database is connected without data loss', async () => {
    const { openDatabase, closeDb } = await import('@src/db/index.js');
    const db1 = openDatabase(dbPath);
    db1.prepare("INSERT INTO contexts (id, name, status) VALUES ('ctx1', 'Test', 'active')").run();
    closeDb();

    // Reimport to clear singleton — use dynamic import with cache bust not possible in vitest easily,
    // so we just reopen on same path
    const db2 = openDatabase(dbPath);
    const row = db2.prepare("SELECT name FROM contexts WHERE id = 'ctx1'").get() as any;
    expect(row.name).toBe('Test');
  });

  it('enforces foreign key constraints', async () => {
    const { openDatabase } = await import('@src/db/index.js');
    const db = openDatabase(dbPath);
    expect(() => {
      db.prepare(
        "INSERT INTO messages (id, context_id, channel, peer_id, role, content) VALUES ('m1', 'nonexistent', 'web', 'user1', 'user', 'hello')"
      ).run();
    }).toThrow();
  });
});

describe('getDb() singleton', () => {
  it('returns the same instance on repeated calls', async () => {
    const { openDatabase, getDb } = await import('@src/db/index.js');
    openDatabase(dbPath);
    const a = getDb();
    const b = getDb();
    expect(a).toBe(b);
  });
});

describe('closeDb()', () => {
  it('closes the connection cleanly', async () => {
    const { openDatabase, closeDb, getDb } = await import('@src/db/index.js');
    openDatabase(dbPath);
    closeDb();
    expect(() => getDb()).toThrow(/closed/i);
  });
});
