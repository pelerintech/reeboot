import { describe, it, expect, vi } from 'vitest';

// Mock scheduler-registry before importing memory-manager
const registerJobSpy = vi.fn();
const mockScheduler = {
  registerJob: registerJobSpy,
  cancelJob: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

vi.mock('../../src/scheduler-registry.js', () => ({
  globalScheduler: mockScheduler,
  setGlobalScheduler: vi.fn((s: any) => {
    Object.assign(mockScheduler, s);
  }),
}));

const { makeMemoryExtension, registerServerJobs } = await import('../../src/extensions/memory-manager.js');

describe('memory consolidation — registerServerJobs', () => {
  beforeEach(() => {
    registerJobSpy.mockClear();
  });

  it('does NOT register consolidation job at extension load time', () => {
    const mockPi = {
      on: vi.fn(),
      registerTool: vi.fn(),
    };

    makeMemoryExtension(mockPi as any, {
      memory: {
        enabled: true,
        consolidation: { enabled: true, schedule: '0 2 * * *' },
      },
    });

    // The job should NOT be registered at load time (the race condition fix)
    expect(registerJobSpy).not.toHaveBeenCalled();
  });

  it('registers consolidation job via registerServerJobs when enabled', () => {
    registerServerJobs({} as any, mockScheduler as any, {
      memory: {
        enabled: true,
        consolidation: { enabled: true, schedule: '0 2 * * *' },
      },
    });

    // Now the job should be registered
    expect(registerJobSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '__memory_consolidation__',
        schedule: '0 2 * * *',
      })
    );
  });

  it('does NOT register consolidation job via registerServerJobs when consolidation is disabled', () => {
    registerServerJobs({} as any, mockScheduler as any, {
      memory: {
        enabled: true,
        consolidation: { enabled: false },
      },
    });

    expect(registerJobSpy).not.toHaveBeenCalled();
  });

  it('does NOT register consolidation job via registerServerJobs when memory is disabled', () => {
    registerServerJobs({} as any, mockScheduler as any, {
      memory: {
        enabled: false,
      },
    });

    expect(registerJobSpy).not.toHaveBeenCalled();
  });
});
