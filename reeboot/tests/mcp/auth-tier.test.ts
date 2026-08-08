/**
 * mcp-trust S4 — auth-tier filter on the MCP surface.
 *
 * The read-only-substrate selection also threads the minAuthLevel / applyAuthLevel()
 * tier filter: a surfaced substrate tool whose required auth tier is above the
 * connection's tier is neither advertised nor callable, while anonymous-tier
 * substrate tools remain available. (All currently-surfaced substrate tools are
 * anonymous-tier, so this is behavior-neutral for the existing set, but the seam
 * must exist for ree-mode tier-mapped tokens.)
 */
import { describe, it, expect } from 'vitest';
import { selectReadOnlyTools, toolToMcpTool } from '@src/mcp-server.js';
import type { ToolDefinition } from '@src/extensions/extension-api.js';

function def(name: string, params: any = { type: 'object', properties: {} }, minAuthLevel?: string): ToolDefinition {
  return {
    name,
    label: name,
    description: `desc for ${name}`,
    parameters: params,
    minAuthLevel: minAuthLevel as any,
    execute: async () => ({ content: `result for ${name}`, details: {} }),
  };
}

/** Registry of substrate tools, one of which (jina_read) requires the 'admin' tier. */
const registry = {
  list: (): ToolDefinition[] => [
    def('knowledge_search', { type: 'object', properties: { query: { type: 'string' } } }),
    def('session_search'), // anonymous, from a local/protected store
    def('jina_read', { type: 'object', properties: { url: { type: 'string' } } }, 'admin'),
    def('web_search'),
  ],
};

describe('mcp-trust S4 auth-tier filter', () => {
  it('excludes substrate tools gated above the connection tier', () => {
    const names = selectReadOnlyTools(registry, 'anonymous').map((t) => t.name);
    expect(names).toContain('knowledge_search');
    expect(names).toContain('session_search');
    expect(names).toContain('web_search');
    // admin-gated substrate tool is NOT visible to an anonymous-tier connection
    expect(names).not.toContain('jina_read');
  });

  it('includes higher-tier substrate tools for a matching tier', () => {
    const names = selectReadOnlyTools(registry, 'admin').map((t) => t.name);
    expect(names).toContain('jina_read');
    expect(names).toContain('knowledge_search');
  });

  it('defaults to anonymous when no tier is supplied', () => {
    const names = selectReadOnlyTools(registry).map((t) => t.name);
    expect(names).not.toContain('jina_read');
    expect(names).toContain('session_search');
  });

  it('a gated tool is not callable over MCP (not surfaced by the pass-through map)', () => {
    // Compose the same way server.ts does: filter by the connection's tier, then map.
    const surfaced = selectReadOnlyTools(registry, 'anonymous').map((t) =>
      toolToMcpTool(t, { config: {}, workspacePath: '/tmp/w' }),
    );
    const names = surfaced.map((t) => t.name);
    expect(names).not.toContain('jina_read');
    expect(names).toContain('session_search');
  });
});
