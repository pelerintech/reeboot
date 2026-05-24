import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger so we can assert error logging in catch blocks
const logErrorSpy = vi.fn();
vi.mock('../../src/observability/logger.js', () => ({
  getLogger: () => ({ error: logErrorSpy, info: vi.fn(), warn: vi.fn() }),
}));

// emitSpy is the _extensionRunner.emit spy — shared across all tests
const emitSpy = vi.fn();

// bindExtensionsSpy simulates what the real SDK does inside bindExtensions:
// the SDK calls extensionRunner.emit({ type: 'session_start', ... })
const bindExtensionsSpy = vi.fn(async (_opts: any) => {
  await emitSpy({ type: 'session_start', reason: 'new' });
});

vi.mock('@earendil-works/pi-coding-agent', () => {
  function createMockSession() {
    let subscriber: ((event: any) => void) | null = null;
    return {
      bindExtensions: bindExtensionsSpy,
      _extensionRunner: { emit: emitSpy },
      subscribe: vi.fn((fn) => {
        subscriber = fn;
        // Immediately fire agent_end so prompt resolves
        Promise.resolve().then(() => {
          subscriber?.({ type: 'agent_end', messages: [] });
        });
        return () => {};
      }),
      prompt: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
  }

  return {
    createAgentSession: vi.fn(() => Promise.resolve({ session: createMockSession() })),
    SessionManager: {
      inMemory: vi.fn(() => ({})),
      create: vi.fn(() => ({})),
      open: vi.fn(() => ({})),
    },
    AuthStorage: {
      inMemory: vi.fn(() => ({ setRuntimeApiKey: vi.fn() })),
      create: vi.fn(() => ({})),
    },
    ModelRegistry: {
      create: vi.fn(() => ({})),
    },
    SettingsManager: {
      inMemory: vi.fn(() => ({})),
      create: vi.fn(() => ({})),
    },
  };
});

// We'll import PiAgentRunner from the real file
const { PiAgentRunner } = await import('../../src/agent-runner/pi-runner.js');

describe('pi-runner session lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default bindExtensions implementation after clearAllMocks resets it
    bindExtensionsSpy.mockImplementation(async (_opts: any) => {
      await emitSpy({ type: 'session_start', reason: 'new' });
    });
  });

  it('calls session.bindExtensions after session creation', async () => {
    const runner = new PiAgentRunner(
      { id: 'test', workspacePath: '/tmp' },
      { reload: vi.fn().mockResolvedValue(undefined), getExtensions: vi.fn(), getSkills: vi.fn() } as any,
    );

    await runner.prompt('hi', () => {});

    // bindExtensions should have been called exactly once
    expect(bindExtensionsSpy).toHaveBeenCalledTimes(1);

    // The call should include a shutdownHandler function
    const callArg = bindExtensionsSpy.mock.calls[0][0];
    expect(callArg).toBeDefined();
    expect(typeof callArg.shutdownHandler).toBe('function');
  });

  it('calls bindExtensions on each new session after reset', async () => {
    const runner = new PiAgentRunner(
      { id: 'test', workspacePath: '/tmp' },
      { reload: vi.fn().mockResolvedValue(undefined), getExtensions: vi.fn(), getSkills: vi.fn() } as any,
    );

    // First prompt creates session 1
    await runner.prompt('hi', () => {});
    expect(bindExtensionsSpy).toHaveBeenCalledTimes(1);

    // Reset
    await runner.reset();

    // Second prompt creates session 2
    await runner.prompt('hi again', () => {});
    expect(bindExtensionsSpy).toHaveBeenCalledTimes(2);
  });

  it('emits session_shutdown with reason new on reset', async () => {
    const runner = new PiAgentRunner(
      { id: 'test', workspacePath: '/tmp' },
      { reload: vi.fn().mockResolvedValue(undefined), getExtensions: vi.fn(), getSkills: vi.fn() } as any,
    );

    // Create a session first
    await runner.prompt('hi', () => {});

    // Reset should emit session_shutdown — clear emitSpy first so only reset's call counts
    emitSpy.mockClear();
    await runner.reset();

    expect(emitSpy).toHaveBeenCalledWith({ type: 'session_shutdown', reason: 'new' });
  });

  it('emits session_shutdown with reason quit on dispose', async () => {
    const runner = new PiAgentRunner(
      { id: 'test', workspacePath: '/tmp' },
      { reload: vi.fn().mockResolvedValue(undefined), getExtensions: vi.fn(), getSkills: vi.fn() } as any,
    );

    // Create a session first
    await runner.prompt('hi', () => {});

    // Dispose should emit session_shutdown — clear emitSpy first
    emitSpy.mockClear();
    await runner.dispose();

    expect(emitSpy).toHaveBeenCalledWith({ type: 'session_shutdown', reason: 'quit' });
  });

  it('does not emit session_shutdown when no session exists', async () => {
    const runner = new PiAgentRunner(
      { id: 'test', workspacePath: '/tmp' },
      { reload: vi.fn().mockResolvedValue(undefined), getExtensions: vi.fn(), getSkills: vi.fn() } as any,
    );

    // Reset without ever creating a session
    await runner.reset();

    // emitSpy called for session_shutdown — but there was no session, so nothing
    expect(emitSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'session_shutdown' }));
  });

  it('fires session_start on the extension runner when bindExtensions is called', async () => {
    const runner = new PiAgentRunner(
      { id: 'test', workspacePath: '/tmp' },
      { reload: vi.fn().mockResolvedValue(undefined), getExtensions: vi.fn(), getSkills: vi.fn() } as any,
    );

    await runner.prompt('hi', () => {});

    // bindExtensions was called once and it emitted session_start (simulating SDK behaviour)
    expect(bindExtensionsSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith({ type: 'session_start', reason: 'new' });
  });

  it('catches and logs errors when session_shutdown emit throws, _session still nulled', async () => {
    // Make emitSpy throw on session_shutdown calls only
    emitSpy.mockImplementation((event: any) => {
      if (event?.type === 'session_shutdown') {
        throw new Error('emit blew up');
      }
    });

    const runner = new PiAgentRunner(
      { id: 'test', workspacePath: '/tmp' },
      { reload: vi.fn().mockResolvedValue(undefined), getExtensions: vi.fn(), getSkills: vi.fn() } as any,
    );

    await runner.prompt('hi', () => {});

    // Reset — emitSpy throws on session_shutdown, but _session must still be nulled
    await runner.reset();

    // Error must be logged (not silently swallowed by bare catch {})
    expect(logErrorSpy).toHaveBeenCalled();

    // Session must still be nulled despite the error
    expect((runner as any)._session).toBeNull();
  });
});
