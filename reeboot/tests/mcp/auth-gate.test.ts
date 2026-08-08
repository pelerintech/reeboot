/**
 * Task 6 — Auth gate: loopback trusted, non-loopback requires bearer token.
 */
import { describe, it, expect } from 'vitest';
import { buildMcpApp, mcpAuthOk } from '@src/mcp-server.js';

const initializeBody = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
};

function makeApp(apiKey?: string) {
  return buildMcpApp({
    serverName: 'reeboot',
    serverVersion: '2.6.0',
    getTools: () => [],
    authorize: (c) => mcpAuthOk(c, { apiKey }),
  });
}

async function init(app: any, headers: Record<string, string> = {}) {
  return app.request('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(initializeBody),
  });
}

describe('MCP auth gate', () => {
  it('mcpAuthOk: no key configured → allow (loopback-only default)', () => {
    expect(mcpAuthOk({ req: { header: () => undefined, query: () => undefined }, env: {} }, { apiKey: undefined })).toBe(true);
  });

  it('mcpAuthOk: loopback is allowed even with a key configured', () => {
    const c = { req: { header: () => undefined, query: () => undefined }, env: { incoming: { socket: { remoteAddress: '127.0.0.1' } } } };
    expect(mcpAuthOk(c, { apiKey: 'secret' })).toBe(true);
  });

  it('mcpAuthOk: non-loopback without/with wrong token → denied', () => {
    const c = { req: { header: () => undefined, query: () => undefined }, env: { incoming: { socket: { remoteAddress: '192.168.1.5' } } } };
    expect(mcpAuthOk(c, { apiKey: 'secret' })).toBe(false);
  });

  it('mcpAuthOk: non-loopback with correct Bearer token → allowed', () => {
    const c = { req: { header: () => 'Bearer secret', query: () => undefined }, env: { incoming: { socket: { remoteAddress: '192.168.1.5' } } } };
    expect(mcpAuthOk(c, { apiKey: 'secret' })).toBe(true);
  });

  it('rejects initialize (401) when the authorize gate denies', async () => {
    const app = buildMcpApp({
      serverName: 'reeboot', serverVersion: '2.6.0', getTools: () => [],
      authorize: () => false,
    });
    const res = await init(app);
    expect(res.status).toBe(401);
  });

  it('serves initialize when the authorize gate allows', async () => {
    const app = buildMcpApp({
      serverName: 'reeboot', serverVersion: '2.6.0', getTools: () => [],
      authorize: () => true,
    });
    const res = await init(app);
    expect([200, 202, 201]).toContain(res.status);
  });
});
