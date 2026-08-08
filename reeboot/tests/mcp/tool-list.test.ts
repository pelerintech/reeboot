/**
 * Task 5 — Tool-list advertisement: JSON Schema, existing names, substrate only.
 *
 * The MCP surface is READ-ONLY SUBSTRATE. The eligibility filter exposes only
 * headless-safe read-only tools (memory recall, knowledge_search, web read, dreem
 * graph) from the retained registry; mutating / UI / loop / control-plane tools are
 * excluded. Names are kept as-is (no reeboot:: prefix); params are emitted as JSON Schema.
 */
import { describe, it, expect } from 'vitest';
import { selectReadOnlyTools } from '@src/mcp-server.js';
import type { ToolDefinition } from '@src/extensions/extension-api.js';

function def(name: string, params: any = { type: 'object', properties: {} }): ToolDefinition {
  return {
    name,
    label: name,
    description: `desc for ${name}`,
    parameters: params,
    execute: async () => ({ content: 'ok', details: {} }),
  };
}

const registry = {
  list: (): ToolDefinition[] => [
    def('knowledge_search', { type: 'object', properties: { query: { type: 'string' } } }),
    def('session_search'),
    def('jina_read'),
    def('web_search'),
    def('memory::builtin::hot-memory'),
    // excluded — mutating / UI / loop / control-plane
    def('memory'),
    def('knowledge_ingest'),
    def('knowledge_file'),
    def('render_plan'),
    def('render_confirm'),
    def('delegate'),
    def('schedule_task'),
    def('budget_status'),
    def('load_skill'),
    def('mcp'),
  ],
};

describe('read-only substrate eligibility filter', () => {
  it('exposes only read-only substrate tools', () => {
    const names = selectReadOnlyTools(registry).map((t) => t.name);
    expect(names).toContain('knowledge_search');
    expect(names).toContain('session_search');
    expect(names).toContain('jina_read');
    expect(names).toContain('web_search');
    expect(names).toContain('memory::builtin::hot-memory');
  });

  it('excludes mutating and UI/loop/control-plane tools', () => {
    const names = selectReadOnlyTools(registry).map((t) => t.name);
    expect(names).not.toContain('memory');
    expect(names).not.toContain('knowledge_ingest');
    expect(names).not.toContain('knowledge_file');
    expect(names).not.toContain('render_plan');
    expect(names).not.toContain('render_confirm');
    expect(names).not.toContain('delegate');
    expect(names).not.toContain('schedule_task');
    expect(names).not.toContain('budget_status');
    expect(names).not.toContain('load_skill');
    expect(names).not.toContain('mcp');
  });

  it('keeps existing names (no reeboot:: prefix) and JSON-Schema params', () => {
    const tools = selectReadOnlyTools(registry);
    const ks = tools.find((t) => t.name === 'knowledge_search')!;
    expect(ks.name).toBe('knowledge_search');
    expect(ks.parameters).toEqual({ type: 'object', properties: { query: { type: 'string' } } });
  });
});
