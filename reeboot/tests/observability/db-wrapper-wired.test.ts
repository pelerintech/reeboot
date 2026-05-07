import { describe, it, expect, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

describe('OB-1-D: wrapDb wired into openDatabase()', () => {
  it('openDatabase returns a db where prepare().get() emits debug logs via getLogger', async () => {
    // openDatabase should wire wrapDb so that all queries go through the wrapper.
    // We spy on the logger's debug method and confirm it fires when a query runs.
    vi.resetModules();

    const { getLogger, initLogger } = await import('@src/observability/logger.js');
    initLogger({ level: 'debug' });
    const debugSpy = vi.spyOn(getLogger(), 'debug').mockImplementation((() => {}) as any);

    const { openDatabase, closeDb } = await import('@src/db/index.js');
    const dbPath = join(tmpdir(), `reeboot-test-${Date.now()}.db`);
    const db = openDatabase(dbPath);

    // Run a query through the db
    db.prepare('SELECT 1').get();

    closeDb();
    try { rmSync(dbPath); } catch {}

    // debug should have been called with sql info
    const sqlCalls = debugSpy.mock.calls.filter(
      (args) => typeof args[0] === 'object' && args[0] !== null && 'sql' in (args[0] as object)
    );
    expect(sqlCalls.length).toBeGreaterThan(0);

    debugSpy.mockRestore();
  });
});
