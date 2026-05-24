import { describe, it, expect, vi } from 'vitest';

// We need to import registerServerJobs from memory-manager, but it doesn't exist yet.
// The import will fail — that's the RED.

describe('memory-manager registerServerJobs', () => {
  it('registerServerJobs exports exist and register consolidation job when enabled', async () => {
    // Dynamic import — will fail because registerServerJobs is not yet a named export
    const { registerServerJobs } = await import('../../src/extensions/memory-manager.js');

    const registerJobSpy = vi.fn();
    const mockScheduler = {
      registerJob: registerJobSpy,
      cancelJob: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const mockDb = {} as any;

    registerServerJobs(mockDb, mockScheduler, {
      memory: { enabled: true, consolidation: { enabled: true, schedule: '0 2 * * *' } },
    });

    expect(registerJobSpy).toHaveBeenCalledTimes(1);
    expect(registerJobSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '__memory_consolidation__',
      })
    );
  });

  it('does NOT register when consolidation is disabled', async () => {
    const { registerServerJobs } = await import('../../src/extensions/memory-manager.js');

    const registerJobSpy = vi.fn();
    const mockScheduler = {
      registerJob: registerJobSpy,
      cancelJob: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const mockDb = {} as any;

    registerServerJobs(mockDb, mockScheduler, {
      memory: { enabled: true, consolidation: { enabled: false } },
    });

    expect(registerJobSpy).not.toHaveBeenCalled();
  });

  it('does NOT register when memory is disabled', async () => {
    const { registerServerJobs } = await import('../../src/extensions/memory-manager.js');

    const registerJobSpy = vi.fn();
    const mockScheduler = {
      registerJob: registerJobSpy,
      cancelJob: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const mockDb = {} as any;

    registerServerJobs(mockDb, mockScheduler, {
      memory: { enabled: false },
    });

    expect(registerJobSpy).not.toHaveBeenCalled();
  });
});
