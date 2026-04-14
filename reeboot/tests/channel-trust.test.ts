/**
 * Channel Trust Tests
 *
 * Covers:
 *   - IncomingMessage trust field
 *   - Orchestrator attaches trust to messages
 *   - Runner stores per-turn trust
 *   - Tool whitelist enforcement
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Task 4: IncomingMessage trust field ─────────────────────────────────────

describe('IncomingMessage trust field', () => {
  it('preserves trust field when constructing with createIncomingMessage', async () => {
    const { createIncomingMessage } = await import('@src/channels/interface.js');
    const msg = createIncomingMessage({
      channelType: 'web',
      peerId: 'peer1',
      content: 'hello',
      raw: {},
      trust: 'end-user',
    });
    expect(msg.trust).toBe('end-user');
  });

  it('trust field is undefined when not provided', async () => {
    const { createIncomingMessage } = await import('@src/channels/interface.js');
    const msg = createIncomingMessage({
      channelType: 'web',
      peerId: 'peer1',
      content: 'hello',
      raw: {},
    });
    expect(msg.trust).toBeUndefined();
  });
});

// ─── Task 5: Orchestrator attaches trust to messages ─────────────────────────

describe('Orchestrator attaches trust', () => {
  it('resolves and passes end-user trust for end-user channel', async () => {
    const { Orchestrator } = await import('@src/orchestrator.js');
    const { MessageBus, createIncomingMessage } = await import('@src/channels/interface.js');

    const bus = new MessageBus();
    const promptCalls: any[] = [];
    const runner = {
      prompt: vi.fn().mockImplementation(async (_content: string, onEvent: any, options: any) => {
        promptCalls.push({ options });
        onEvent({ type: 'message_end', runId: 'r1', usage: { input: 0, output: 0 } });
      }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = {
      send: vi.fn().mockResolvedValue(undefined),
      init: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockReturnValue('connected'),
      connectedAt: vi.fn().mockReturnValue(null),
    };

    const config = {
      routing: { default: 'main', rules: [] },
      session: { inactivityTimeout: 14_400_000 },
      channels: { web: { trust: 'end-user', trusted_senders: [] } },
    } as any;

    const runners = new Map([['main', runner]]);
    const adapters = new Map([['web', adapter]]);

    const orchestrator = new Orchestrator(config, bus, adapters, runners);
    orchestrator.start();

    const msg = createIncomingMessage({
      channelType: 'web',
      peerId: 'peer1',
      content: 'hello',
      raw: {},
    });

    bus.publish(msg);

    // Allow async dispatch to complete
    await new Promise(r => setTimeout(r, 10));

    expect(promptCalls.length).toBe(1);
    expect(promptCalls[0].options?.trust).toBe('end-user');

    orchestrator.stop();
  });
});

// ─── Task 6: Runner stores per-turn trust ────────────────────────────────────

describe('PiAgentRunner per-turn trust', () => {
  it('stores end-user trust from prompt options', async () => {
    const { PiAgentRunner } = await import('@src/agent-runner/pi-runner.js');

    // Minimal mock loader
    const loader = { reload: vi.fn().mockResolvedValue(undefined) } as any;

    const runner = new PiAgentRunner({ id: 'main', workspacePath: '/tmp' }, loader);

    // Inject a mock session to avoid pi SDK calls
    // Fire agent_end asynchronously so the subscribe callback's unsubscribe ref is ready
    const mockSession = {
      subscribe: vi.fn().mockImplementation((cb: any) => {
        setTimeout(() => cb({ type: 'agent_end', messages: [] }), 0);
        return () => {};
      }),
      prompt: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
    (runner as any)._session = mockSession;

    await runner.prompt('hello', () => {}, { trust: 'end-user' });
    expect((runner as any)._currentTrust).toBe('end-user');

    await runner.prompt('hello', () => {}, { trust: 'owner' });
    expect((runner as any)._currentTrust).toBe('owner');
  });

  it('defaults to owner when no options passed', async () => {
    const { PiAgentRunner } = await import('@src/agent-runner/pi-runner.js');
    const loader = { reload: vi.fn().mockResolvedValue(undefined) } as any;
    const runner = new PiAgentRunner({ id: 'main', workspacePath: '/tmp' }, loader);

    const mockSession = {
      subscribe: vi.fn().mockImplementation((cb: any) => {
        setTimeout(() => cb({ type: 'agent_end', messages: [] }), 0);
        return () => {};
      }),
      prompt: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
    (runner as any)._session = mockSession;

    await runner.prompt('hello', () => {});
    expect((runner as any)._currentTrust).toBe('owner');
  });
});

// ─── Tasks 7 & 8: Tool whitelist enforcement ─────────────────────────────────

describe('Tool whitelist enforcement', () => {
  async function makeRunnerWithWhitelist(whitelist: string[]) {
    const { PiAgentRunner } = await import('@src/agent-runner/pi-runner.js');
    const loader = { reload: vi.fn().mockResolvedValue(undefined) } as any;
    const config = { contexts: [{ name: 'main', tools: { whitelist } }] } as any;
    const runner = new PiAgentRunner({ id: 'main', workspacePath: '/tmp' }, loader, config);
    return runner;
  }

  function makeMockSession() {
    return {
      subscribe: vi.fn().mockImplementation((cb: any) => {
        setTimeout(() => cb({ type: 'agent_end', messages: [] }), 0);
        return () => {};
      }),
      prompt: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      abort: vi.fn(),
    };
  }

  async function getToolCallHook(mockSession: ReturnType<typeof makeMockSession>) {
    // The hook was registered via on() — extract it
    const call = (mockSession.on as any).mock.calls.find((c: any[]) => c[0] === 'tool_call');
    return call?.[1] as ((event: any) => any) | undefined;
  }

  it('blocks non-whitelisted tool for end-user', async () => {
    const runner = await makeRunnerWithWhitelist(['send_message']);

    const mockSession = makeMockSession();
    (runner as any)._session = mockSession;

    await runner.prompt('hello', () => {}, { trust: 'end-user' });

    const toolCallHook = await getToolCallHook(mockSession);
    expect(toolCallHook).toBeDefined();
    const result = await toolCallHook!({ toolName: 'bash' });
    expect(result).toMatchObject({ block: true });
  });

  it('does NOT block whitelisted tool for end-user', async () => {
    const runner = await makeRunnerWithWhitelist(['send_message']);
    const mockSession = makeMockSession();
    (runner as any)._session = mockSession;

    await runner.prompt('hello', () => {}, { trust: 'end-user' });

    const toolCallHook = await getToolCallHook(mockSession);
    const result = await toolCallHook!({ toolName: 'send_message' });
    expect(result).toBeUndefined();
  });

  it('does NOT block any tool for owner trust', async () => {
    const runner = await makeRunnerWithWhitelist(['send_message']);
    const mockSession = makeMockSession();
    (runner as any)._session = mockSession;

    await runner.prompt('hello', () => {}, { trust: 'owner' });

    const toolCallHook = await getToolCallHook(mockSession);
    const result = await toolCallHook!({ toolName: 'bash' });
    expect(result).toBeUndefined();
  });

  it('does NOT block when whitelist is empty (opt-in restriction)', async () => {
    const runner = await makeRunnerWithWhitelist([]);
    const mockSession = makeMockSession();
    (runner as any)._session = mockSession;

    await runner.prompt('hello', () => {}, { trust: 'end-user' });

    const toolCallHook = await getToolCallHook(mockSession);
    const result = await toolCallHook!({ toolName: 'bash' });
    expect(result).toBeUndefined();
  });
});
