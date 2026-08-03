/**
 * Shared helper: build a socket-free real reeboot app with a fully-migrated
 * temp database and temp home. Drive routes via `app.request()`.
 *
 * The db is opened with `openDatabase()` so the full schema + migrations are
 * applied (contexts, tasks, operational_logs, events, turn_journal/closed_at,
 * memory, budget), matching production. `stop()` tears down the logger/retention
 * singletons so the test process can exit cleanly.
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type Database from 'better-sqlite3';
import { openDatabase } from '../../src/db/index.js';

export interface TestAppHost {
  app: {
    request: (input: string | Request, init?: any) => Promise<Response>;
  };
  db: Database.Database;
  reebotDir: string;
  stop: () => Promise<void>;
  cleanup: () => void;
}

export async function buildTestApp(opts: Record<string, any> = {}): Promise<TestAppHost> {
  const reebotDir = mkdtempSync(join(tmpdir(), 'reeboot-app-'));
  const db = openDatabase(join(reebotDir, 'reeboot.db'));

  const mod: any = await import('../../src/server.js');
  const app: any = await mod.buildApp({ db, reebotDir, ...opts });
  const stopServer = mod.stopServer;

  return {
    app,
    db,
    reebotDir,
    stop: async () => {
      try { await stopServer(); } catch { /* ignore */ }
    },
    cleanup: () => {
      try { db.close(); } catch { /* ignore */ }
      try { rmSync(reebotDir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}
