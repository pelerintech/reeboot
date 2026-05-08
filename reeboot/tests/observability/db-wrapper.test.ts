import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';

describe('DB debug wrapper', () => {
  it('imports wrapDb from the module', async () => {
    const mod = await import('@src/observability/db-wrapper.js');
    expect(typeof mod.wrapDb).toBe('function');
  });

  it('wrapDb returns an object with prepare()', async () => {
    const { wrapDb } = await import('@src/observability/db-wrapper.js');
    const db = new Database(':memory:');
    const wrapped = wrapDb(db);
    expect(typeof wrapped.prepare).toBe('function');
  });

  it('wrapped prepare().get() returns same result as unwrapped', async () => {
    const { wrapDb } = await import('@src/observability/db-wrapper.js');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT)`);
    db.exec(`INSERT INTO test VALUES (1, 'hello')`);

    const wrapped = wrapDb(db);
    const row = wrapped.prepare('SELECT * FROM test WHERE id = ?').get(1) as any;
    expect(row.val).toBe('hello');
  });

  it('wrapped prepare().all() returns same result as unwrapped', async () => {
    const { wrapDb } = await import('@src/observability/db-wrapper.js');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT)`);
    db.exec(`INSERT INTO test VALUES (1, 'a')`);
    db.exec(`INSERT INTO test VALUES (2, 'b')`);

    const wrapped = wrapDb(db);
    const rows = wrapped.prepare('SELECT * FROM test').all() as any[];
    expect(rows).toHaveLength(2);
  });

  it('wrapped prepare().run() returns same result as unwrapped', async () => {
    const { wrapDb } = await import('@src/observability/db-wrapper.js');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT)`);

    const wrapped = wrapDb(db);
    const result = wrapped.prepare('INSERT INTO test VALUES (?, ?)').run(1, 'hello');
    expect(result.changes).toBe(1);
  });

  it('debug logs are emitted on get/all/run calls', async () => {
    const { wrapDb } = await import('@src/observability/db-wrapper.js');
    const { getLogger } = await import('@src/observability/logger.js');

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT)`);
    db.exec(`INSERT INTO test VALUES (1, 'x')`);

    const debugSpy = vi.spyOn(getLogger(), 'debug').mockImplementation((() => {}) as any);
    const wrapped = wrapDb(db);

    wrapped.prepare('SELECT * FROM test').get();
    wrapped.prepare('SELECT * FROM test').all();
    wrapped.prepare('INSERT INTO test VALUES (?, ?)').run(2, 'y');

    expect(debugSpy).toHaveBeenCalled();
    // Each call should include sql and durationMs
    const firstCall = debugSpy.mock.calls[0][0] as any;
    expect(firstCall).toHaveProperty('sql');
    expect(firstCall).toHaveProperty('durationMs');

    debugSpy.mockRestore();
  });

  it('error level is emitted when statement throws', async () => {
    const { wrapDb } = await import('@src/observability/db-wrapper.js');
    const { getLogger } = await import('@src/observability/logger.js');

    const db = new Database(':memory:');
    const errorSpy = vi.spyOn(getLogger(), 'error').mockImplementation((() => {}) as any);
    const wrapped = wrapDb(db);

    expect(() => wrapped.prepare('SELECT * FROM nonexistent_table').get()).toThrow();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
