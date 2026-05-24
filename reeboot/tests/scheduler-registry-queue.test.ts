import { describe, it, expect, vi } from 'vitest';

describe('scheduler-registry deferred queue', () => {
  it('queues jobs before setGlobalScheduler is called, drains when set', async () => {
    vi.resetModules();
    const mod = await import('../src/scheduler-registry.js');

    const spyScheduler = {
      registerJob: vi.fn(),
      cancelJob: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    // Register a job BEFORE setting the real scheduler
    mod.registerJob({ id: 'j1', contextId: 'main', schedule: '0 2 * * *', prompt: 'test prompt' });

    // The spy should NOT have been called yet
    expect(spyScheduler.registerJob).not.toHaveBeenCalled();

    // Now set the real scheduler
    mod.setGlobalScheduler(spyScheduler as any);

    // After draining, the spy should have been called once
    expect(spyScheduler.registerJob).toHaveBeenCalledTimes(1);
    expect(spyScheduler.registerJob).toHaveBeenCalledWith({
      id: 'j1',
      contextId: 'main',
      schedule: '0 2 * * *',
      prompt: 'test prompt',
    });
  });

  it('forwards immediately when real scheduler is already set', async () => {
    vi.resetModules();
    const mod = await import('../src/scheduler-registry.js');

    const spyScheduler = {
      registerJob: vi.fn(),
      cancelJob: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    // Set the real scheduler first
    mod.setGlobalScheduler(spyScheduler as any);

    // Now register a job
    mod.registerJob({ id: 'j2', contextId: 'main', schedule: '0 3 * * *', prompt: 'test prompt 2' });

    // Should have been forwarded immediately
    expect(spyScheduler.registerJob).toHaveBeenCalledTimes(1);
    expect(spyScheduler.registerJob).toHaveBeenCalledWith({
      id: 'j2',
      contextId: 'main',
      schedule: '0 3 * * *',
      prompt: 'test prompt 2',
    });
  });

  it('drains multiple pending jobs in order', async () => {
    vi.resetModules();
    const mod = await import('../src/scheduler-registry.js');

    const spyScheduler = {
      registerJob: vi.fn(),
      cancelJob: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    // Register multiple jobs before setting scheduler
    mod.registerJob({ id: 'a', contextId: 'main', schedule: '* * * * *', prompt: 'a' });
    mod.registerJob({ id: 'b', contextId: 'main', schedule: '* * * * *', prompt: 'b' });
    mod.registerJob({ id: 'c', contextId: 'main', schedule: '* * * * *', prompt: 'c' });

    expect(spyScheduler.registerJob).not.toHaveBeenCalled();

    mod.setGlobalScheduler(spyScheduler as any);

    expect(spyScheduler.registerJob).toHaveBeenCalledTimes(3);
    // Check call order
    expect(spyScheduler.registerJob.mock.calls[0][0]).toMatchObject({ id: 'a' });
    expect(spyScheduler.registerJob.mock.calls[1][0]).toMatchObject({ id: 'b' });
    expect(spyScheduler.registerJob.mock.calls[2][0]).toMatchObject({ id: 'c' });
  });

  it('does not re-drain jobs when setGlobalScheduler is called again', async () => {
    vi.resetModules();
    const mod = await import('../src/scheduler-registry.js');

    const spyScheduler1 = {
      registerJob: vi.fn(),
      cancelJob: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    const spyScheduler2 = {
      registerJob: vi.fn(),
      cancelJob: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    mod.registerJob({ id: 'j', contextId: 'main', schedule: '* * * * *', prompt: 'p' });
    mod.setGlobalScheduler(spyScheduler1 as any);

    expect(spyScheduler1.registerJob).toHaveBeenCalledTimes(1);

    // Call again with a different scheduler
    mod.setGlobalScheduler(spyScheduler2 as any);

    // Second scheduler should NOT receive already-drained jobs
    expect(spyScheduler2.registerJob).not.toHaveBeenCalled();
  });
});
