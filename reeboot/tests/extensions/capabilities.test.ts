import { describe, it, expect, vi } from 'vitest';
import * as observabilityModule from '../../src/observability/events.js';
import * as dbModule from '../../src/db/index.js';

import { makeCapabilitiesExtension } from '../../src/extensions/capabilities.js';

describe('capabilities extension', () => {
  function createMockPi(tools: any[] = []) {
    const handlers: Record<string, Array<(event: any) => any>> = {};
    const mockPi = {
      getAllTools: vi.fn(() => tools),
      on: vi.fn((event: string, handler: (event: any) => any) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      }),
      _handlers: handlers,
    };
    return mockPi;
  }

  it('registers before_agent_start handler and injects minimal block when no tools', async () => {
    const mockPi = createMockPi([]);
    makeCapabilitiesExtension(mockPi as any, {});

    expect(mockPi.on).toHaveBeenCalledWith('before_agent_start', expect.any(Function));
    expect(mockPi._handlers['before_agent_start']).toHaveLength(1);

    const event = { systemPrompt: 'existing prompt' };
    const result = await mockPi._handlers['before_agent_start'][0](event);

    expect(result).toBeDefined();
    expect(result.systemPrompt).toContain('existing prompt');
    expect(result.systemPrompt).toContain('ADDITIONAL CAPABILITIES');
  });

  it('filters out built-in pi tools and includes custom tools', async () => {
    const tools = [
      {
        name: 'bash',
        description: 'Execute a shell command',
        parameters: {},
        sourceInfo: { path: '/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/bash.js' },
      },
      {
        name: 'read',
        description: 'Read a file',
        parameters: {},
        sourceInfo: { path: '/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/read.js' },
      },
      {
        name: 'memory',
        description: 'Manage persistent memory entries',
        parameters: {},
        sourceInfo: { path: '/reeboot/dist/extensions/memory-manager.js' },
      },
      {
        name: 'session_search',
        description: 'Search past conversations',
        parameters: {},
        sourceInfo: { path: '/reeboot/dist/extensions/memory-manager.js' },
      },
    ];

    const mockPi = createMockPi(tools);
    makeCapabilitiesExtension(mockPi as any, {});

    const event = { systemPrompt: 'existing prompt' };
    const result = await mockPi._handlers['before_agent_start'][0](event);

    // Custom tools should be present
    expect(result.systemPrompt).toContain('memory');
    expect(result.systemPrompt).toContain('Manage persistent memory entries');
    expect(result.systemPrompt).toContain('session_search');
    expect(result.systemPrompt).toContain('Search past conversations');

    // Built-in tools should NOT be present in the capabilities block
    // (they may appear in the existing prompt, so we check the block specifically)
    const blockStart = result.systemPrompt.indexOf('ADDITIONAL CAPABILITIES');
    const block = result.systemPrompt.slice(blockStart);
    expect(block).not.toContain('bash');
    expect(block).not.toContain('read');
  });

  it('produces a structured block with tool descriptions and usage guidance', async () => {
    const tools = [
      {
        name: 'memory',
        description: 'Manage persistent memory entries in MEMORY.md and USER.md',
        parameters: {},
        sourceInfo: { path: '/reeboot/dist/extensions/memory-manager.js' },
      },
    ];

    const mockPi = createMockPi(tools);
    makeCapabilitiesExtension(mockPi as any, {});

    const event = { systemPrompt: 'existing prompt' };
    const result = await mockPi._handlers['before_agent_start'][0](event);

    const blockStart = result.systemPrompt.indexOf('ADDITIONAL CAPABILITIES');
    const block = result.systemPrompt.slice(blockStart);

    // Should contain the tool name
    expect(block).toContain('memory');
    // Should contain the description
    expect(block).toContain('Manage persistent memory entries');
    // Should contain usage guidance
    expect(block).toContain('Use them proactively');
  });

  it('caps external tools at default EXTERNAL_CAP and notes remainder', async () => {
    const tools = Array.from({ length: 80 }, (_, i) => ({
      name: `ext_tool_${i}`,
      description: `External tool ${i}`,
      parameters: {},
      sourceInfo: { path: `/user/mcp-server/tool-${i}.js` },
    }));

    const mockPi = createMockPi(tools);
    makeCapabilitiesExtension(mockPi as any, {});

    const event = { systemPrompt: 'existing prompt' };
    const result = await mockPi._handlers['before_agent_start'][0](event);

    const blockStart = result.systemPrompt.indexOf('ADDITIONAL CAPABILITIES');
    const block = result.systemPrompt.slice(blockStart);

    // External tools capped at 50
    const bulletMatches = block.match(/• ext_tool_/g);
    expect(bulletMatches).toHaveLength(50);

    // Should note the remaining 30 tools
    expect(block).toContain('and 30 more external tool(s) not shown');
  });

  it('emits capabilities_injected event with tool count and names', async () => {
    const emitEventSpy = vi.spyOn(observabilityModule, 'emitEvent').mockResolvedValue(undefined);
    vi.spyOn(dbModule, 'getDb').mockReturnValue({ prepare: vi.fn(() => ({ run: vi.fn() })) } as any);

    const tools = [
      {
        name: 'memory',
        description: 'Manage persistent memory entries',
        parameters: {},
        sourceInfo: { path: '/reeboot/dist/extensions/memory-manager.js' },
      },
      {
        name: 'session_search',
        description: 'Search past conversations',
        parameters: {},
        sourceInfo: { path: '/reeboot/dist/extensions/memory-manager.js' },
      },
    ];

    const mockPi = createMockPi(tools);
    makeCapabilitiesExtension(mockPi as any, {});

    const event = { systemPrompt: 'existing prompt' };
    const result = await mockPi._handlers['before_agent_start'][0](event);

    // Verify the block was injected with the tools
    expect(result.systemPrompt).toContain('memory');
    expect(result.systemPrompt).toContain('session_search');

    expect(emitEventSpy).toHaveBeenCalled();
    const callArgs = emitEventSpy.mock.calls[0];
    expect(callArgs[1]).toMatchObject({
      type: 'capabilities_injected',
      severity: 9,
      payload: expect.objectContaining({
        toolCount: 2,
        toolNames: ['memory', 'session_search'],
      }),
    });

    emitEventSpy.mockRestore();
  });

  it('renders per-tool usage hints in the capabilities block', async () => {
    const tools = [
      {
        name: 'memory',
        description: 'Manage persistent memory entries',
        parameters: {},
        sourceInfo: { path: '/reeboot/dist/extensions/memory-manager.js' },
      },
      {
        name: 'session_search',
        description: 'Search past conversations',
        parameters: {},
        sourceInfo: { path: '/reeboot/dist/extensions/memory-manager.js' },
      },
    ];

    const mockPi = createMockPi(tools);
    makeCapabilitiesExtension(mockPi as any, {});

    const event = { systemPrompt: 'existing prompt' };
    const result = await mockPi._handlers['before_agent_start'][0](event);

    const blockStart = result.systemPrompt.indexOf('ADDITIONAL CAPABILITIES');
    const block = result.systemPrompt.slice(blockStart);

    // Each tool should have a per-tool usage hint
    expect(block).toMatch(/Use `memory`/i);
    expect(block).toMatch(/Use `session_search`/i);
    // The generic hint alone is not enough
    const specificHints = (block.match(/Use `[^`]+`/g) || []).length;
    expect(specificHints).toBeGreaterThanOrEqual(2);
  });

  it('emits event with sourceBreakdown and capped external toolCount', async () => {
    const emitEventSpy = vi.spyOn(observabilityModule, 'emitEvent').mockResolvedValue(undefined);
    vi.spyOn(dbModule, 'getDb').mockReturnValue({ prepare: vi.fn(() => ({ run: vi.fn() })) } as any);

    const tools = Array.from({ length: 80 }, (_, i) => ({
      name: `ext_tool_${i}`,
      description: `Description for tool ${i}`,
      parameters: {},
      sourceInfo: { path: `/user/mcp-server/tool-${i}.js` },
    }));

    const mockPi = createMockPi(tools);
    makeCapabilitiesExtension(mockPi as any, {});

    const event = { systemPrompt: 'existing prompt' };
    await mockPi._handlers['before_agent_start'][0](event);

    expect(emitEventSpy).toHaveBeenCalled();
    const callPayload = emitEventSpy.mock.calls[0][1].payload;

    // Event payload should reflect the capped count (external cap 50)
    expect(callPayload.toolCount).toBe(50);
    expect(callPayload.toolNames).toHaveLength(50);

    // Source breakdown should be present
    expect(callPayload.sourceBreakdown).toBeDefined();
    expect(callPayload.sourceBreakdown).toMatchObject({
      bundled: expect.any(Number),
      user: expect.any(Number),
      mcp: expect.any(Number),
      skill: expect.any(Number),
    });

    emitEventSpy.mockRestore();
  });

  it('never caps bundled reeboot tools regardless of count', async () => {
    const tools = Array.from({ length: 60 }, (_, i) => ({
      name: `reeboot_tool_${i}`,
      description: `Description for tool ${i}`,
      parameters: {},
      sourceInfo: { path: `/reeboot/dist/extensions/tool-${i}.js` },
    }));

    const mockPi = createMockPi(tools);
    makeCapabilitiesExtension(mockPi as any, {});

    const event = { systemPrompt: 'existing prompt' };
    const result = await mockPi._handlers['before_agent_start'][0](event);

    const block = result.systemPrompt.slice(
      result.systemPrompt.indexOf('ADDITIONAL CAPABILITIES')
    );

    // All 60 bundled tools must appear — none hidden
    const bulletMatches = block.match(/• reeboot_tool_/g);
    expect(bulletMatches).toHaveLength(60);
    expect(block).not.toContain('more tool(s) not shown');
  });

  it('caps external tools at EXTERNAL_CAP but shows all bundled ones', async () => {
    const bundled = Array.from({ length: 20 }, (_, i) => ({
      name: `reeboot_tool_${i}`,
      description: `Bundled tool ${i}`,
      parameters: {},
      sourceInfo: { path: `/reeboot/dist/extensions/tool-${i}.js` },
    }));
    const external = Array.from({ length: 80 }, (_, i) => ({
      name: `mcp_tool_${i}`,
      description: `External tool ${i}`,
      parameters: {},
      sourceInfo: { path: `/user/mcp-server/tools/tool-${i}.js` },
    }));

    const mockPi = createMockPi([...bundled, ...external]);
    makeCapabilitiesExtension(mockPi as any, {});

    const event = { systemPrompt: 'existing prompt' };
    const result = await mockPi._handlers['before_agent_start'][0](event);

    const block = result.systemPrompt.slice(
      result.systemPrompt.indexOf('ADDITIONAL CAPABILITIES')
    );

    // All 20 bundled tools shown
    expect((block.match(/• reeboot_tool_/g) || []).length).toBe(20);
    // External tools capped (default 50)
    expect((block.match(/• mcp_tool_/g) || []).length).toBe(50);
    expect(block).toContain('and 30 more external tool(s) not shown');
  });

  it('respects config override for external cap', async () => {
    const external = Array.from({ length: 20 }, (_, i) => ({
      name: `ext_tool_${i}`,
      description: `External tool ${i}`,
      parameters: {},
      sourceInfo: { path: `/user/custom/tool-${i}.js` },
    }));

    const mockPi = createMockPi(external);
    makeCapabilitiesExtension(mockPi as any, {
      capabilities: { externalToolCap: 10 },
    });

    const event = { systemPrompt: 'existing prompt' };
    const result = await mockPi._handlers['before_agent_start'][0](event);

    const block = result.systemPrompt.slice(
      result.systemPrompt.indexOf('ADDITIONAL CAPABILITIES')
    );

    const bulletMatches = block.match(/• ext_tool_/g);
    expect(bulletMatches).toHaveLength(10);
    expect(block).toContain('and 10 more external tool(s) not shown');
  });
});
