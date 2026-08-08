/**
 * Task 3 — Streamable HTTP /mcp route mounts on the Hono app.
 *
 * The MCP server is a Streamable HTTP endpoint mounted at /mcp on the Hono app
 * (sibling of /a2a and /webhook). Initialize should return server info.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestAppHost } from '../helpers/test-app.js';

let host: TestAppHost;

beforeAll(async () => {
  host = await buildTestApp();
});
afterAll(async () => {
  await host.stop();
  host.cleanup();
});

async function mcpRaw(body: unknown): Promise<Response> {
  return host.app.request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
    // @ts-ignore — Hono request helpers accept a full-duplex Request-like
  });
}

describe('MCP server route', () => {
  it('mounts /mcp and answers the initialize handshake with server info', async () => {
    const res = await mcpRaw({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    });
    expect([200, 202, 201]).toContain(res.status);
    const text = await res.text();
    const isSse = (res.headers.get('content-type') ?? '').includes('text/event-stream');
    if (isSse) {
      expect(text).toContain('serverInfo');
      expect(text).toContain('reeboot');
      expect(text).toContain('protocolVersion');
    } else {
      const body = JSON.parse(text);
      expect(body.result.serverInfo.name).toBe('reeboot');
      expect(body.result.serverInfo.version).toBeDefined();
      expect(body.result.protocolVersion).toBeDefined();
    }
  });
});
