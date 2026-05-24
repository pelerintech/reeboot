import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// Mock the module imports so we can test bootstrap in isolation
const schedulerRegisterSpy = vi.fn();

// Mock memory-manager's registerServerJobs to always call scheduler.registerJob
vi.mock('../src/extensions/memory-manager.js', () => ({
  registerServerJobs: vi.fn((_db: any, scheduler: any, config: any) => {
    const mc = config?.memory;
    if (mc?.enabled && mc?.consolidation?.enabled) {
      scheduler.registerJob({
        id: '__memory_consolidation__',
        contextId: 'main',
        schedule: mc.consolidation.schedule ?? '0 2 * * *',
        prompt: 'consolidation prompt',
      });
    }
  }),
}));

// Mock knowledge-manager's registerServerJobs to always call scheduler.registerJob
vi.mock('../src/extensions/knowledge-manager.js', () => ({
  registerServerJobs: vi.fn((_db: any, scheduler: any, config: any) => {
    const kc = config?.knowledge;
    if (kc?.enabled && kc?.wiki?.enabled) {
      scheduler.registerJob({
        id: '__knowledge_lint__',
        contextId: 'main',
        schedule: kc.wiki?.lint?.schedule ?? '0 9 * * 1',
        prompt: 'knowledge lint prompt',
      });
    }
  }),
}));

vi.mock('../src/observability/logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

function makeDbWithTasks(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      context_id TEXT NOT NULL REFERENCES contexts(id),
      schedule TEXT NOT NULL,
      prompt TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Add all the scheduler columns
  const cols = [
    'schedule_type', 'schedule_value', 'normalized_ms', 'status',
    'next_run', 'last_result', 'context_mode',
    'catchup', 'origin_channel', 'origin_peer'
  ];
  for (const col of cols) {
    try { db.exec(`ALTER TABLE tasks ADD COLUMN ${col} TEXT`); } catch { /* already exists */ }
  }

  // Insert the context
  db.prepare(`INSERT OR IGNORE INTO contexts (id, name) VALUES (?, ?)`).run('main', 'main');

  return db;
}

describe('bootstrap server jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bootstrapServerJobs registers memory consolidation job when enabled', async () => {
    const { bootstrapServerJobs } = await import('../src/bootstrap.js');

    const db = makeDbWithTasks();
    const mockScheduler = { registerJob: schedulerRegisterSpy };
    const config = {
      memory: { enabled: true, consolidation: { enabled: true, schedule: '0 2 * * *' } },
      knowledge: { enabled: false },
    };

    bootstrapServerJobs(db, mockScheduler as any, config);

    // The mock memory registerServerJobs checks config gates and calls scheduler.registerJob
    const memCalls = schedulerRegisterSpy.mock.calls.filter(
      (c: any) => c[0].id === '__memory_consolidation__'
    );
    expect(memCalls).toHaveLength(1);

    // knowledge should NOT be registered (disabled)
    const knCalls = schedulerRegisterSpy.mock.calls.filter(
      (c: any) => c[0].id === '__knowledge_lint__'
    );
    expect(knCalls).toHaveLength(0);

    db.close();
  });

  it('bootstrapServerJobs registers knowledge lint job when enabled', async () => {
    const { bootstrapServerJobs } = await import('../src/bootstrap.js');

    const db = makeDbWithTasks();
    const mockScheduler = { registerJob: schedulerRegisterSpy };
    const config = {
      memory: { enabled: false },
      knowledge: { enabled: true, wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } } },
    };

    bootstrapServerJobs(db, mockScheduler as any, config);

    const knCalls = schedulerRegisterSpy.mock.calls.filter(
      (c: any) => c[0].id === '__knowledge_lint__'
    );
    expect(knCalls).toHaveLength(1);

    const memCalls = schedulerRegisterSpy.mock.calls.filter(
      (c: any) => c[0].id === '__memory_consolidation__'
    );
    expect(memCalls).toHaveLength(0);

    db.close();
  });

  it('bootstrapServerJobs catches errors from individual registrations', async () => {
    // Clear previous mocks and re-mock with error
    vi.resetModules();

    const memorySpy = vi.fn().mockImplementation(() => {
      throw new Error('Simulated memory failure');
    });

    vi.doMock('../src/extensions/memory-manager.js', () => ({
      registerServerJobs: memorySpy,
    }));

    vi.doMock('../src/extensions/knowledge-manager.js', () => ({
      registerServerJobs: vi.fn((_db: any, scheduler: any, config: any) => {
        const kc = config?.knowledge;
        if (kc?.enabled && kc?.wiki?.enabled) {
          scheduler.registerJob({ id: '__knowledge_lint__', contextId: 'main', schedule: '0 9 * * 1', prompt: 'p' });
        }
      }),
    }));

    vi.doMock('../src/observability/logger.js', () => ({
      getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      })),
    }));

    const { bootstrapServerJobs } = await import('../src/bootstrap.js');

    const db = makeDbWithTasks();
    const mockScheduler = { registerJob: schedulerRegisterSpy };
    const config = {
      memory: { enabled: true, consolidation: { enabled: true } },
      knowledge: { enabled: true, wiki: { enabled: true } },
    };

    // Should NOT throw — error is caught
    expect(() => bootstrapServerJobs(db, mockScheduler as any, config)).not.toThrow();

    // Knowledge should still have been registered (failure isolation)
    const knCalls = schedulerRegisterSpy.mock.calls.filter(
      (c: any) => c[0].id === '__knowledge_lint__'
    );
    expect(knCalls).toHaveLength(1);

    db.close();
  });
});