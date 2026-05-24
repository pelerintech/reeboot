import { describe, it, expect, vi } from 'vitest';

describe('knowledge-manager registerServerJobs', () => {
  it('registerServerJobs registers knowledge_lint when wiki is enabled', async () => {
    const { registerServerJobs } = await import(
      '../../src/extensions/knowledge-manager.js'
    );

    const registerJobSpy = vi.fn();
    const mockScheduler = {
      registerJob: registerJobSpy,
      cancelJob: vi.fn(),
    };
    const mockDb = {} as any;

    registerServerJobs(mockDb, mockScheduler, {
      knowledge: {
        enabled: true,
        wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } },
      },
    });

    expect(registerJobSpy).toHaveBeenCalledTimes(1);
    expect(registerJobSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '__knowledge_lint__',
        schedule: '0 9 * * 1',
      })
    );
  });

  it('does NOT register when wiki.enabled is false', async () => {
    const { registerServerJobs } = await import(
      '../../src/extensions/knowledge-manager.js'
    );

    const registerJobSpy = vi.fn();
    const mockScheduler = {
      registerJob: registerJobSpy,
      cancelJob: vi.fn(),
    };
    const mockDb = {} as any;

    registerServerJobs(mockDb, mockScheduler, {
      knowledge: {
        enabled: true,
        wiki: { enabled: false },
      },
    });

    expect(registerJobSpy).not.toHaveBeenCalled();
  });

  it('does NOT register when knowledge.enabled is false', async () => {
    const { registerServerJobs } = await import(
      '../../src/extensions/knowledge-manager.js'
    );

    const registerJobSpy = vi.fn();
    const mockScheduler = {
      registerJob: registerJobSpy,
      cancelJob: vi.fn(),
    };
    const mockDb = {} as any;

    registerServerJobs(mockDb, mockScheduler, {
      knowledge: {
        enabled: false,
      },
    });

    expect(registerJobSpy).not.toHaveBeenCalled();
  });
});