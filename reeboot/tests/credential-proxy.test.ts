/**
 * Credential proxy tests (task 3.1) — TDD red
 *
 * Tests the Fastify proxy on 127.0.0.1:3001 that injects real API keys.
 * Uses Fastify's inject() to avoid the fetch mock intercepting client calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Mock fetch (for target provider forwarding calls) ────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('credential proxy', () => {
  let startProxy: any;
  let stopProxy: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ startProxy, stopProxy } = await import('@src/credential-proxy.js'));
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
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{}',
    });

    const config = {
      credentialProxy: { enabled: true, port: 0 },
      agent: { model: { provider: 'anthropic', apiKey: 'real-anthropic-key' } },
    };
    const server = await startProxy(config);
    expect(server).not.toBeNull();

    const addresses = server.addresses();
    expect(addresses.length).toBeGreaterThan(0);
    // Should be loopback only
    expect(addresses[0].address).toBe('127.0.0.1');
  });

  it('forwards request with real API key replacing placeholder', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"id":"msg_forwarded"}',
    });

    const config = {
      credentialProxy: { enabled: true, port: 0 },
      agent: { model: { provider: 'anthropic', apiKey: 'real-anthropic-key-123' } },
    };
    const server = await startProxy(config);

    // Use Fastify inject to avoid fetch mock conflict on the client side
    await server.inject({
      method: 'POST',
      url: '/v1/messages',
      headers: {
        'Authorization': 'Bearer placeholder-reeboot',
        'X-Reeboot-Provider': 'anthropic',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'claude-opus-4-5', messages: [] }),
    });

    // The proxy's forwarding fetch should have been called with the real key
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('anthropic.com'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer real-anthropic-key-123',
        }),
      })
    );
  });

  it('uses correct provider URL for openai', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{"id":"openai-resp"}',
    });

    const config = {
      credentialProxy: { enabled: true, port: 0 },
      agent: { model: { provider: 'openai', apiKey: 'real-openai-key-456' } },
    };
    const server = await startProxy(config);

    await server.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: {
        'Authorization': 'Bearer placeholder-reeboot',
        'X-Reeboot-Provider': 'openai',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('openai.com'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer real-openai-key-456',
        }),
      })
    );
  });

  it('uses correct provider URL for google', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => '{}',
    });

    const config = {
      credentialProxy: { enabled: true, port: 0 },
      agent: { model: { provider: 'google', apiKey: 'real-google-key' } },
    };
    const server = await startProxy(config);

    await server.inject({
      method: 'GET',
      url: '/v1/models',
      headers: {
        'Authorization': 'Bearer placeholder-reeboot',
        'X-Reeboot-Provider': 'google',
      },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.googleapis.com'),
      expect.any(Object)
    );
  });
});
