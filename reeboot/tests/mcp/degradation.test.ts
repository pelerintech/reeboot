/**
 * Task 8 — Graceful degradation at the edge.
 *
 * A read-only substrate tool whose backend is unavailable degrades to an explicit,
 * honest result over MCP (no throw that kills the session) — matching reeboot's
 * graceful-degradation idiom. The session stays usable for subsequent calls.
 */
import { describe, it, expect } from 'vitest';
import { buildMcpApp, toolToMcpTool, type McpTool } from '@src/mcp-server.js';
import type { ToolDefinition } from '@src/extensions/extension-api.js';

function failingTool(): ToolDefinition {
  return {
    name: 'fragile',
    label: 'Fragile',
    description: 'Backend tends to be unavailable',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({
      content: JSON.stringify({ error: 'memory provider unavailable' }),
      isError: true,
    }),
  };
}

function healthyTool(): ToolDefinition {
  return {
    name: 'healthy',
    label: 'Healthy',
    description: 'Works fine',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ content: 'all good', details: {} }),
  };
}

async function rpc(app: any, method: string, params: any, id = 1): Promise<any> {
  const res = await app.request('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
  const payload = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(text);
  if (payload.error) throw new Error(JSON.stringify(payload.error));
  return payload.result;
}

describe('MCP graceful degradation', () => {
  it('a backend-down tool returns an honest error result and the connection survives', async () => {
    const tools: McpTool[] = [toolToMcpTool(failingTool(), { config: {}, workspacePath: '/tmp/w' })];
    const app = buildMcpApp({ serverName: 'reeboot', serverVersion: '2.6.0', getTools: () => tools });

    const bad = await rpc(app, 'tools/call', { name: 'fragile', arguments: {} });
    expect(bad.content[0].text).toContain('error');
    expect(bad.isError).toBe(true);

    // Session still usable: tools/list still answers.
    const list = await rpc(app, 'tools/list', {});
    expect(list.tools.map((t: any) => t.name)).toContain('fragile');
  });

  it('a healthy tool after a degraded call still returns its normal result', async () => {
    const tools: McpTool[] = [
      toolToMcpTool(failingTool(), { config: {}, workspacePath: '/tmp/w' }),
      toolToMcpTool(healthyTool(), { config: {}, workspacePath: '/tmp/w' }),
    ];
    const app = buildMcpApp({ serverName: 'reeboot', serverVersion: '2.6.0', getTools: () => tools });

    await rpc(app, 'tools/call', { name: 'fragile', arguments: {} });
    const ok = await rpc(app, 'tools/call', { name: 'healthy', arguments: {} });
    expect(ok.content[0].text).toBe('all good');
  });
});
