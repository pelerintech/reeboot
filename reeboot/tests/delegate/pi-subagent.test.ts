import { describe, it, expect, vi } from 'vitest';
import type { AgentRunner, RunnerEvent } from '@src/agent-runner/interface.js';

describe('Delegate tool — pi sub-agent session', () => {
  it('creates a sub-agent runner via factory and returns result', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    // Mock runner that simulates a sub-agent completing a task
    const mockRunner: AgentRunner = {
      prompt: vi.fn().mockImplementation(async (content: string, onEvent: (e: RunnerEvent) => void) => {
        // Simulate tool call then final response
        onEvent({ type: 'tool_call_start', toolName: 'search', id: '1', parameters: {} });
        onEvent({ type: 'text_delta', delta: 'Found result: Paris is the capital of France.' });
        onEvent({ type: 'message_end', content: [{ type: 'text', text: 'Paris is the capital of France.' }] });
      }),
      abort: vi.fn(),
      dispose: vi.fn(),
      reset: vi.fn(),
    } as any;

    const factory = vi.fn().mockReturnValue(mockRunner);

    let registeredTool: any = null;
    const mockApi = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    delegateExtension(mockApi, { runnerFactory: factory });

    // Execute the delegate tool
    const result = await registeredTool.execute('id', { task: 'What is the capital of France?' }, null, null, {});

    expect(factory).toHaveBeenCalledWith('What is the capital of France?');
    expect(mockRunner.prompt).toHaveBeenCalledWith('What is the capital of France?', expect.any(Function));
    expect(result).toBeDefined();
    expect(result.content[0].text).toBe('Found result: Paris is the capital of France.');
  });

  it('returns error when runner is not available', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    let registeredTool: any = null;
    const mockApi = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    delegateExtension(mockApi, {}); // No runnerFactory

    const result = await registeredTool.execute('id', { task: 'Do something' }, null, null, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not available');
  });

  it('requires a non-empty task', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    let registeredTool: any = null;
    const mockApi = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    delegateExtension(mockApi, { runnerFactory: vi.fn() });

    const result = await registeredTool.execute('id', { task: '' }, null, null, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('required');
  });

  it('routes to A2A client when peer is specified', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    const mockA2AClient = {
      invoke: vi.fn().mockResolvedValue('A2A result: done'),
    };

    let registeredTool: any = null;
    const mockApi = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    delegateExtension(mockApi, {
      a2aClient: mockA2AClient,
      a2aPeers: { 'research-agent': { url: 'http://localhost:3001', apiKey: 'key' } },
    });

    const result = await registeredTool.execute('id', { task: 'Research X', peer: 'research-agent' }, null, null, {});

    expect(mockA2AClient.invoke).toHaveBeenCalledWith('http://localhost:3001', 'Research X', 'key');
    expect(result.content[0].text).toBe('A2A result: done');
  });

  it('returns error for unknown peer', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    let registeredTool: any = null;
    const mockApi = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    delegateExtension(mockApi, {
      a2aClient: { invoke: vi.fn() },
      a2aPeers: {},
    });

    const result = await registeredTool.execute('id', { task: 'X', peer: 'unknown' }, null, null, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown A2A peer');
  });

  it('returns error when A2A peer is unreachable', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    let registeredTool: any = null;
    const mockApi = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    delegateExtension(mockApi, {
      a2aPeers: { 'peer': { url: 'http://localhost:3001' } },
      // No explicit a2aClient — uses lazy import internally
    });

    const result = await registeredTool.execute('id', { task: 'X', peer: 'peer' }, null, null, {});

    expect(result.isError).toBe(true);
    // Lazy import tries to fetch the peer and fails with a network error
    expect(result.content[0].text).toContain('failed');
  });
});
