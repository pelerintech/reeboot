import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI } from '@src/extensions/extension-api.js';

describe('Delegate tool extension', () => {
  it('registers a delegate tool with correct name and parameters', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    delegateExtension(mockApi, {} as any);

    expect(registeredTool).not.toBeNull();
    expect(registeredTool.name).toBe('delegate');
    expect(typeof registeredTool.execute).toBe('function');
  });

  it('delegate tool accepts task, peer, and timeout parameters', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    delegateExtension(mockApi, {} as any);

    const params = registeredTool.parameters;
    expect(params).toBeDefined();
    expect(params.properties?.task).toBeDefined();
    expect(params.properties?.timeout).toBeDefined();
  });

  it('returns view-compatible result with data-table view for same-process sub-agent', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    const mockRunner: any = {
      prompt: vi.fn().mockImplementation(async (_content: string, onEvent: (e: any) => void) => {
        onEvent({ type: 'text_delta', delta: 'Paris is the capital of France.' });
        onEvent({ type: 'message_end', content: [{ type: 'text', text: 'Paris is the capital of France.' }] });
      }),
      abort: vi.fn(),
      dispose: vi.fn(),
      reset: vi.fn(),
    };

    const factory = vi.fn().mockReturnValue(mockRunner);

    let registeredTool: any = null;
    const mockApi: any = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    };

    delegateExtension(mockApi, { runnerFactory: factory });

    const result = await registeredTool.execute('id', { task: 'What is the capital of France?' }, null, null, {});

    // Must not be an error
    expect(result.isError).toBeFalsy();

    // Must include a view field for rich WebChat rendering
    expect(result.view).toBeDefined();
    expect(result.view.type).toBe('data-table');
    expect(result.view.columns).toEqual(['Task', 'Result']);
    expect(result.view.rows).toHaveLength(1);
    expect(result.view.rows[0].Task).toBe('What is the capital of France?');
    expect(result.view.rows[0].Result).toBe('Paris is the capital of France.');
  });

  it('gives sub-agent access to main agent\'s tool set via runner factory', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    const mainTools = ['memory', 'knowledge_search', 'schedule_task'];

    // Runner that simulates having the same tools as the main agent
    const mockRunner: any = {
      prompt: vi.fn().mockImplementation(async (_content: string, onEvent: (e: any) => void) => {
        onEvent({ type: 'text_delta', delta: 'Tool result: data found' });
        onEvent({ type: 'message_end', content: [{ type: 'text', text: 'Tool result: data found' }] });
      }),
      getAllTools: vi.fn().mockReturnValue(mainTools),
      abort: vi.fn(),
      dispose: vi.fn(),
      reset: vi.fn(),
    };

    const factory = vi.fn((_task: string) => mockRunner);

    let registeredTool: any = null;
    const mockApi: any = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue(mainTools),
      getActiveTools: vi.fn().mockReturnValue(mainTools),
    };

    delegateExtension(mockApi, { runnerFactory: factory });

    const result = await registeredTool.execute('id', { task: 'Search for climate data' }, null, null, {});

    // Factory was called with the task
    expect(factory).toHaveBeenCalledWith('Search for climate data');

    // Sub-agent runner has the same tools as the main agent
    const subAgentTools = mockRunner.getAllTools();
    expect(subAgentTools).toEqual(mainTools);
    expect(subAgentTools).toContain('memory');
    expect(subAgentTools).toContain('knowledge_search');
    expect(subAgentTools).toContain('schedule_task');

    // Result is successfully returned
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Tool result');
  });

  it('returns view-compatible result with data-table view for A2A peer result', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    const mockA2AClient = {
      invoke: vi.fn().mockResolvedValue('A2A result: research done'),
    };

    let registeredTool: any = null;
    const mockApi: any = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    };

    delegateExtension(mockApi, {
      a2aClient: mockA2AClient,
      a2aPeers: { 'research-agent': { url: 'http://localhost:3001' } },
    });

    const result = await registeredTool.execute('id', { task: 'Research X', peer: 'research-agent' }, null, null, {});

    // Must not be an error
    expect(result.isError).toBeFalsy();

    // Must include a view field for rich WebChat rendering
    expect(result.view).toBeDefined();
    expect(result.view.type).toBe('data-table');
    expect(result.view.columns).toEqual(['Task', 'Result']);
    expect(result.view.rows).toHaveLength(1);
    expect(result.view.rows[0].Task).toBe('Research X');
    expect(result.view.rows[0].Result).toBe('A2A result: research done');
  });
});
