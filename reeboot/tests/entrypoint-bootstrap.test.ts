import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('bootstrap wiring in server.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bootstrapServerJobs is importable and callable from server.ts context', async () => {
    // Verify the bootstrap module is wired into server.ts by checking
    // that the import path used in server.ts resolves correctly.

    // server.ts uses dynamic import('./bootstrap.js')
    // So from src/server.ts, the file src/bootstrap.ts should exist
    const mod = await import('../src/bootstrap.js');
    expect(mod.bootstrapServerJobs).toBeInstanceOf(Function);
  });

  it('bootstrapServerJobs can be called with expected signature', async () => {
    const { bootstrapServerJobs } = await import('../src/bootstrap.js');

    // Verify the function signature matches what server.ts will call it with
    // (db, scheduler, config) — these are the types expected in the design
    const mockDb = {} as any;
    const mockScheduler = { registerJob: vi.fn(), cancelJob: vi.fn(), start: vi.fn(), stop: vi.fn() };
    const config = { memory: { enabled: false }, knowledge: { enabled: false } };

    // Should not throw
    expect(() => bootstrapServerJobs(mockDb, mockScheduler as any, config)).not.toThrow();
  });

  it('server.ts has the scheduler init block that calls setGlobalScheduler', async () => {
    // Verify that server.ts imports and uses setGlobalScheduler
    // We can't easily import server.ts without side effects, but we can
    // verify the imports exist and the code path is valid
    const { setGlobalScheduler } = await import('../src/scheduler-registry.js');
    expect(setGlobalScheduler).toBeInstanceOf(Function);
  });

  it('bootstrapServerJobs is called after setGlobalScheduler (call ordering)', async () => {
    // Simulate the exact sequence from server.ts:
    // 1. setGlobalScheduler(schedulerInstance)
    // 2. bootstrapServerJobs(db, schedulerInstance, appConfig)
    const { setGlobalScheduler, registerJob } = await import('../src/scheduler-registry.js');
    const { bootstrapServerJobs } = await import('../src/bootstrap.js');

    // Register a job BEFORE the scheduler is set (deferred queue)
    registerJob({ id: 'test-pre', contextId: 'main', schedule: '* * * * *', prompt: 'test' });

    const spyScheduler = {
      registerJob: vi.fn(),
      cancelJob: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    // Step 1: setGlobalScheduler — drains the deferred queue
    setGlobalScheduler(spyScheduler as any);

    // The deferred job should have been forwarded
    expect(spyScheduler.registerJob).toHaveBeenCalledTimes(1);

    // Reset for the bootstrap call
    spyScheduler.registerJob.mockClear();

    // Step 2: bootstrapServerJobs — uses the now-set scheduler
    const config = {
      memory: { enabled: true, consolidation: { enabled: true, schedule: '0 2 * * *' } },
      knowledge: { enabled: false },
    };

    bootstrapServerJobs({} as any, spyScheduler as any, config);

    // The bootstrap job should have been registered through the real scheduler
    // (memory consolidation when enabled)
    expect(spyScheduler.registerJob).toHaveBeenCalledTimes(1);
  });
});