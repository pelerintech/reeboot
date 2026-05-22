import { describe, it, expect, vi } from 'vitest';

// Mock scheduler-registry before importing memory-manager
const registerJobSpy = vi.fn();
const mockScheduler = {
  registerJob: registerJobSpy,
  cancelJob: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

const noopScheduler = {
  registerJob: vi.fn(),
  cancelJob: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

vi.mock('../../src/scheduler-registry.js', () => ({
  globalScheduler: mockScheduler,
  noopScheduler: noopScheduler,
  setGlobalScheduler: vi.fn((s: any) => {
    Object.assign(mockScheduler, s);
  }),
}));

const { makeMemoryExtension } = await import('../../src/extensions/memory-manager.js');

describe('memory consolidation scheduler race condition', () => {
  beforeEach(() => {
    registerJobSpy.mockClear();
  });

  it('does NOT register consolidation job at extension load time', () => {
    const handlers: Record<string, Array<(event: any) => any>> = {};
    const mockPi = {
      on: vi.fn((event: string, handler: (event: any) => any) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      }),
      registerTool: vi.fn(),
      _handlers: handlers,
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

  it('registers consolidation job on session_start after scheduler is set', async () => {
    const handlers: Record<string, Array<(event: any) => any>> = {};
    const mockPi = {
      on: vi.fn((event: string, handler: (event: any) => any) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      }),
      registerTool: vi.fn(),
      _handlers: handlers,
    };

    makeMemoryExtension(mockPi as any, {
      memory: {
        enabled: true,
        consolidation: { enabled: true, schedule: '0 2 * * *' },
      },
    });

    // Fire session_start event
    expect(handlers['session_start']).toBeDefined();
    expect(handlers['session_start'].length).toBeGreaterThan(0);

    for (const handler of handlers['session_start']) {
      await handler({ reason: 'startup' });
    }

    // Now the job should be registered
    expect(registerJobSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '__memory_consolidation__',
        schedule: '0 2 * * *',
      })
    );
  });

  it('does NOT double-register on multiple session_start events', async () => {
    const handlers: Record<string, Array<(event: any) => any>> = {};
    const mockPi = {
      on: vi.fn((event: string, handler: (event: any) => any) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      }),
      registerTool: vi.fn(),
      _handlers: handlers,
    };

    makeMemoryExtension(mockPi as any, {
      memory: {
        enabled: true,
        consolidation: { enabled: true, schedule: '0 2 * * *' },
      },
    });

    // Fire session_start twice (simulating reload)
    for (const handler of handlers['session_start']) {
      await handler({ reason: 'startup' });
    }
    for (const handler of handlers['session_start']) {
      await handler({ reason: 'reload' });
    }

    // Should only register once
    expect(registerJobSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT register when consolidation is disabled', async () => {
    const handlers: Record<string, Array<(event: any) => any>> = {};
    const mockPi = {
      on: vi.fn((event: string, handler: (event: any) => any) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      }),
      registerTool: vi.fn(),
      _handlers: handlers,
    };

    makeMemoryExtension(mockPi as any, {
      memory: {
        enabled: true,
        consolidation: { enabled: false },
      },
    });

    // session_start handler should not even be registered
    expect(handlers['session_start'] ?? []).toHaveLength(0);
    expect(registerJobSpy).not.toHaveBeenCalled();
  });

  it('does NOT register when memory is disabled', async () => {
    const handlers: Record<string, Array<(event: any) => any>> = {};
    const mockPi = {
      on: vi.fn((event: string, handler: (event: any) => any) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      }),
      registerTool: vi.fn(),
      _handlers: handlers,
    };

    makeMemoryExtension(mockPi as any, {
      memory: {
        enabled: false,
      },
    });

    // No error should be thrown, and no registration should happen
    expect(handlers['session_start'] ?? []).toHaveLength(0);
    expect(registerJobSpy).not.toHaveBeenCalled();
  });
});
