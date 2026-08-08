/**
 * Edge ply — argument schema validation on tools/call.
 *
 * mcp-trust S4 requires every tools/call to thread the same governance as first-party
 * tools, including argument schema validation. Invalid arguments must be rejected with
 * an explicit error result (isError) and must NOT reach the underlying tool's execute().
 */
import { describe, it, expect } from 'vitest';
import { toolToMcpTool, type McpTool } from '@src/mcp-server.js';
import { Type } from 'typebox';
import type { ToolDefinition } from '@src/extensions/extension-api.js';

function queryTool(executed: { calls: number }): ToolDefinition {
  return {
    name: 'knowledge_search',
    label: 'Knowledge Search',
    description: 'Search the corpus',
    parameters: Type.Object({
      query: Type.String(),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
    }),
    execute: async (_id: string, params: any) => {
      executed.calls += 1;
      return { content: `result:${params.query}`, details: {} };
    },
  };
}

function makeTool(t: ToolDefinition): McpTool {
  return toolToMcpTool(t, { config: {}, workspacePath: '/tmp/w' });
}

describe('MCP argument schema validation edge ply', () => {
  it('rejects args that fail the tool schema without invoking execute()', async () => {
    const executed = { calls: 0 };
    const tool = makeTool(queryTool(executed));
    const res = await tool.run({ query: 123 }); // wrong type for string field
    expect(executed.calls).toBe(0); // execute must NOT run
    expect(res.isError).toBe(true);
    expect(res.content).toMatch(/invalid|schema|validation/i);
  });

  it('rejects a missing required field', async () => {
    const executed = { calls: 0 };
    const tool = makeTool(queryTool(executed));
    const res = await tool.run({}); // query required
    expect(executed.calls).toBe(0);
    expect(res.isError).toBe(true);
    expect(res.content).toMatch(/invalid|schema|validation/i);
  });

  it('passes valid args through to execute()', async () => {
    const executed = { calls: 0 };
    const tool = makeTool(queryTool(executed));
    const res = await tool.run({ query: 'hello', limit: 5 });
    expect(executed.calls).toBe(1);
    expect(res.isError).toBe(false);
    expect(res.content).toBe('result:hello');
  });
});
