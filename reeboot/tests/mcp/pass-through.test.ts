/**
 * Task 4 — Pass-through dispatch: tools/call maps to the underlying tool's
 * execute() with a synthesized headless context — no agent loop.
 */
import { describe, it, expect } from 'vitest';
import { buildMcpApp, toolToMcpTool, type McpTool } from '@src/mcp-server.js';
import type { ToolDefinition } from '@src/extensions/extension-api.js';

const echoTool: ToolDefinition = {
  name: 'echo',
  label: 'Echo',
  description: 'Returns the provided value',
  parameters: { type: 'object', properties: { value: { type: 'string' } } },
  execute: async (_id: string, params: any) => ({
    content: [{ type: 'text' as const, text: `echo:${params.value}` }],
    details: {},
  }),
};

const ctxTool: ToolDefinition = {
  name: 'ctx_tool',
  label: 'Ctx Tool',
  description: 'Uses the extension context',
  parameters: { type: 'object', properties: {} },
  execute: async (_id: string, _params: any, _s: unknown, _o: unknown, ctx: any) => ({
    content: [{ type: 'text' as const, text: `hasUI:${ctx.hasUI}` }],
    details: {},
  }),
};

function makeTools(): McpTool[] {
  const opts = { config: {}, workspacePath: '/tmp/w' };
  return [toolToMcpTool(echoTool, opts), toolToMcpTool(ctxTool, opts)];
}

/** Send a JSON-RPC request; return the parsed `result` (handles SSE responses). */
async function rpc(app: any, method: string, params: any, id = 1): Promise<any> {
  const res = await app.request('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  // SSE: "event: message\ndata: {...}\n\n"
  const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
  const payload = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(text);
  if (payload.error) throw new Error(JSON.stringify(payload.error));
  return payload.result;
}

describe('MCP pass-through dispatch', () => {
  it('tools/call executes the underlying tool with args (no agent loop)', async () => {
    const app = buildMcpApp({ serverName: 'reeboot', serverVersion: '2.6.0', getTools: makeTools });
    const result = await rpc(app, 'tools/call', {
      name: 'echo',
      arguments: { value: 'hello' },
    });
    expect(result.content[0].text).toBe('echo:hello');
    expect(result.isError).toBe(false);
  });

  it('passes the headless context (hasUI=false) to ctx-aware tools', async () => {
    const app = buildMcpApp({ serverName: 'reeboot', serverVersion: '2.6.0', getTools: makeTools });
    const result = await rpc(app, 'tools/call', { name: 'ctx_tool', arguments: {} });
    expect(result.content[0].text).toBe('hasUI:false');
  });

  it('advertises the tool in tools/list', async () => {
    const app = buildMcpApp({ serverName: 'reeboot', serverVersion: '2.6.0', getTools: makeTools });
    const result = await rpc(app, 'tools/list', {});
    expect(result.tools.map((t: any) => t.name)).toContain('echo');
    expect(result.tools.find((t: any) => t.name === 'echo').description).toBe('Returns the provided value');
  });
});
