import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Delegate tool — config resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves A2A peers from ctx.config at execution time', async () => {
    const { delegateExtension, setDefaultRunnerFactory, getDefaultRunnerFactory } =
      await import('@src/extensions/delegate.js');

    let registeredTool: any = null;
    const mockApi = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    // Register with NO a2aPeers — they come from ctx.config instead
    delegateExtension(mockApi, {});

    // Mock fetch so the lazy-imported a2aInvoke works
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'completed', result: 'Config-resolved peer result' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // ctx.config contains the a2a.peers config
    const ctx = {
      config: {
        a2a: {
          peers: [
            { name: 'research-agent', url: 'http://localhost:3001', apiKey: 'secret-key' },
          ],
        },
      },
    };

    const result = await registeredTool.execute('id', { task: 'Research X', peer: 'research-agent' }, null, null, ctx);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe('Config-resolved peer result');

    // Verify fetch was called with the correct URL from config
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/a2a/invoke',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer secret-key',
        }),
      })
    );
  });

  it('returns error for unknown peer from ctx.config', async () => {
    const { delegateExtension } =
      await import('@src/extensions/delegate.js');

    let registeredTool: any = null;
    const mockApi = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    delegateExtension(mockApi, {});

    const ctx = {
      config: {
        a2a: {
          peers: [
            { name: 'research-agent', url: 'http://localhost:3001' },
          ],
        },
      },
    };

    const result = await registeredTool.execute('id', { task: 'X', peer: 'unknown-peer' }, null, null, ctx);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown A2A peer');
    expect(result.content[0].text).toContain('research-agent');
  });

  it('setDefaultRunnerFactory and getDefaultRunnerFactory work', async () => {
    const { setDefaultRunnerFactory, getDefaultRunnerFactory } =
      await import('@src/extensions/delegate.js');

    // Should start undefined (module-level state is per-import in vitest)
    // We just test the setter/getter contract
    const factory1 = vi.fn();
    setDefaultRunnerFactory(factory1);

    expect(getDefaultRunnerFactory()).toBe(factory1);

    // Override
    const factory2 = vi.fn();
    setDefaultRunnerFactory(factory2);

    expect(getDefaultRunnerFactory()).toBe(factory2);
  });

  it('returns a ToolResult-compatible shape supporting optional view field', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    let registeredTool: any = null;
    const mockApi = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    delegateExtension(mockApi, {
      runnerFactory: () => ({
        prompt: vi.fn().mockImplementation(async (_c: string, onEvent: any) => {
          onEvent({ type: 'text_delta', delta: 'Structured result: [table data]' });
          onEvent({ type: 'message_end', runId: 'r1', usage: { input: 10, output: 5 } });
        }),
        abort: vi.fn(),
        dispose: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
      }) as any,
    });

    const result = await registeredTool.execute('id', { task: 'Get table' }, null, null, {});

    // ToolResult shape: content array + optional view
    expect(result).toHaveProperty('content');
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty('type', 'text');
    // view is now set for successful results — data-table with task and result
    expect(result.view).toBeDefined();
    expect(result.view.type).toBe('data-table');
    expect(result.view.columns).toEqual(['Task', 'Result']);
    expect(result.view.rows).toHaveLength(1);
    expect(result.view.rows[0].Task).toBe('Get table');
    expect(result.view.rows[0].Result).toBe('Structured result: [table data]');
    // Result is compatible with ToolView extraction
    const { extractViewFromToolResult } = await import('@src/structured-views.js');
    const extracted = extractViewFromToolResult({ content: result.content, view: result.view });
    expect(extracted.view).toBeDefined();
    expect(extracted.view.type).toBe('data-table');
    expect(extracted.content).toBeDefined();
  });

  it('falls back to default runner factory when no opts.runnerFactory is given', async () => {
    const { delegateExtension, setDefaultRunnerFactory } =
      await import('@src/extensions/delegate.js');

    const mockRunner = {
      prompt: vi.fn().mockImplementation(async (_content: string, onEvent: any) => {
        onEvent({ type: 'text_delta', delta: 'Default factory result' });
        onEvent({ type: 'message_end', runId: 'r1', usage: { input: 10, output: 5 } });
      }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
    } as any;

    const factory = vi.fn().mockReturnValue(mockRunner);
    setDefaultRunnerFactory(factory);

    let registeredTool: any = null;
    const mockApi = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    // Register with NO runnerFactory — uses the default
    delegateExtension(mockApi, {});

    const result = await registeredTool.execute('id', { task: 'Use default factory' }, null, null, {});

    expect(factory).toHaveBeenCalledWith('Use default factory');
    expect(result.content[0].text).toBe('Default factory result');
  });
});
