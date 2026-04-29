/**
 * Credential proxy tests (Hono version)
 *
 * Tests the Hono proxy that intercepts LLM API calls and injects real API keys.
 * Uses createProxyApp().fetch() for direct handler testing (no server needed).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mock fetch (for target provider forwarding calls) ────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('credential proxy (Hono)', () => {
  let startProxy: any;
  let stopProxy: any;
  let createProxyApp: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ startProxy, stopProxy, createProxyApp } = await import('@src/credential-proxy.js'));
  });

  afterEach(async () => {
    try { await stopProxy(); } catch { /* ignore */ }
  });

  it('does not start when credentialProxy.enabled is false', async () => {
    const config = {
      credentialProxy: { enabled: false, port: 0 },
      agent: { model: { provider: 'anthropic', apiKey: 'real-key' } },
    };
    const result = await startProxy(config);
    expect(result).toBeNull();
  });

  it('starts on loopback when enabled', async () => {
    const config = {
      credentialProxy: { enabled: true, port: 0 },
      agent: { model: { provider: 'anthropic', apiKey: 'real-anthropic-key' } },
    };
    const server = await startProxy(config);
    expect(server).not.toBeNull();

    const addr = server.address();
    expect(addr).not.toBeNull();
    if (typeof addr === 'object' && addr !== null) {
      expect(addr.address).toBe('127.0.0.1');
    }
  });

  it('forwards request with real API key replacing placeholder', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"id":"msg_forwarded"}',
    });

    const config = {
      credentialProxy: { enabled: false },
      agent: { model: { provider: 'anthropic', apiKey: 'real-anthropic-key-123' } },
    };

    const app = createProxyApp(config);
    const req = new Request('http://localhost/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer placeholder-reeboot',
        'X-Reeboot-Provider': 'anthropic',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'claude-opus-4-5', messages: [] }),
    });

    const res = await app.fetch(req);
    expect(res.status).toBe(200);

    const [, options] = mockFetch.mock.calls[0] as [string, { headers: Headers; body: string }];
    expect(options.headers.get('Authorization')).toBe('Bearer real-anthropic-key-123');
    expect(options.body).toBe(JSON.stringify({ model: 'claude-opus-4-5', messages: [] }));
  });

  it('uses correct provider URL for openai', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"id":"openai-resp"}',
    });

    const config = {
      credentialProxy: { enabled: false },
      agent: { model: { provider: 'openai', apiKey: 'real-openai-key-456' } },
    };

    const app = createProxyApp(config);
    const req = new Request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer placeholder-reeboot',
        'X-Reeboot-Provider': 'openai',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    await app.fetch(req);

    const [, options] = mockFetch.mock.calls[0] as [string, { headers: Headers }];
    expect(options.headers.get('Authorization')).toBe('Bearer real-openai-key-456');
  });

  it('uses correct provider URL for google', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{}',
    });

    const config = {
      credentialProxy: { enabled: false },
      agent: { model: { provider: 'google', apiKey: 'real-google-key' } },
    };

    const app = createProxyApp(config);
    const req = new Request('http://localhost/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer placeholder-reeboot',
        'X-Reeboot-Provider': 'google',
      },
    });

    await app.fetch(req);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.googleapis.com'),
      expect.any(Object)
    );
  });

  it('handles provider errors with 502', async () => {
    mockFetch.mockRejectedValue(new Error('Network timeout'));

    const config = {
      credentialProxy: { enabled: false },
      agent: { model: { provider: 'anthropic', apiKey: 'key' } },
    };

    const app = createProxyApp(config);
    const req = new Request('http://localhost/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer placeholder',
        'X-Reeboot-Provider': 'anthropic',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    const res = await app.fetch(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Proxy error/);
  });

  it('proxyApp.fetch works for direct handler testing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"direct":"ok"}',
    });

    const { proxyApp } = await import('@src/credential-proxy.js');
    const req = new Request('http://localhost/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer placeholder',
        'X-Reeboot-Provider': 'anthropic',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'test' }),
    });

    const res = await proxyApp.fetch(req);
    expect(res.status).toBe(200);
  });

  it('stopProxy is idempotent', async () => {
    await stopProxy();
    await expect(stopProxy()).resolves.toBeUndefined();
  });
});
