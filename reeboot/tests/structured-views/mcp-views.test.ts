import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI } from '@src/extensions/extension-api.js';

describe('MCP proxy tool structured views', () => {
  it('mcp list action returns data-table view with tool list', async () => {
    // Mock an MCP client that returns tools
    const mockClient = {
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: 'tool1', description: 'First tool' },
          { name: 'tool2', description: 'Second tool' },
        ],
      }),
    };

    // We test the mcp tool's execute logic by calling through the extension
    const { mcpManagerExtension } = await import('@src/extensions/mcp-manager.js');
    const { McpServerPool } = await import('@src/extensions/mcp-manager.js');

    const pool = new McpServerPool({ mcp: { servers: [{ name: 'test-server', command: '', args: [] }] } } as any);
    // Replace the pool's getOrConnect to return our mock
    vi.spyOn(pool, 'getOrConnect').mockResolvedValue(mockClient);

    // Create a mock ExtensionAPI that captures the registered tool
    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    // Register the mcp extension
    mcpManagerExtension(mockApi, { mcp: { servers: [{ name: 'test-server', command: '', args: [] }] } } as any, pool);

    expect(registeredTool).not.toBeNull();
    expect(registeredTool.name).toBe('mcp');

    // Call the execute function with action: list
    const result = await registeredTool.execute('test-id', { action: 'list', server: 'test-server' }, undefined, undefined, {});

    // Should include a view field with data-table type
    expect(result.view).toBeDefined();
    expect(result.view.type).toBe('data-table');
    expect(result.view.columns).toEqual(['Name', 'Description']);
    expect(result.view.rows).toHaveLength(2);
    expect(result.view.rows[0].name).toBe('tool1');
  });

  it('mcp call action returns data-table view for structured result', async () => {
    const mockClient = {
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]) }],
      }),
    };

    const { mcpManagerExtension, McpServerPool } = await import('@src/extensions/mcp-manager.js');
    const pool = new McpServerPool({ mcp: { servers: [{ name: 'test-server', command: '', args: [] }] } } as any);
    vi.spyOn(pool, 'getOrConnect').mockResolvedValue(mockClient);

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    mcpManagerExtension(mockApi, { mcp: { servers: [{ name: 'test-server', command: '', args: [] }] } } as any, pool);

    const result = await registeredTool.execute('test-id', { action: 'call', server: 'test-server', tool: 'get-items' }, undefined, undefined, {});

    // Should include a data-table view
    expect(result.view).toBeDefined();
    expect(result.view.type).toBe('data-table');
    expect(result.view.columns).toContain('id');
    expect(result.view.columns).toContain('name');
    expect(result.view.rows).toHaveLength(2);
  });

  it('mcp call action returns no view for unstructured result', async () => {
    const mockClient = {
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Plain text response' }],
      }),
    };

    const { mcpManagerExtension, McpServerPool } = await import('@src/extensions/mcp-manager.js');
    const pool = new McpServerPool({ mcp: { servers: [{ name: 'test-server', command: '', args: [] }] } } as any);
    vi.spyOn(pool, 'getOrConnect').mockResolvedValue(mockClient);

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    mcpManagerExtension(mockApi, { mcp: { servers: [{ name: 'test-server', command: '', args: [] }] } } as any, pool);

    const result = await registeredTool.execute('test-id', { action: 'call', server: 'test-server', tool: 'get-text' }, undefined, undefined, {});

    // Should NOT include a view field for unstructured text
    expect(result.view).toBeUndefined();
  });
});
