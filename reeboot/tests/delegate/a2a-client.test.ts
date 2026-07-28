import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('A2A client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends task to A2A peer via HTTP POST', async () => {
    const { a2aInvoke } = await import('@src/extensions/a2a-client.js');

    // Mock fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'completed', result: 'Peer result: done' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await a2aInvoke('http://localhost:3001', 'Research topic X');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/a2a/invoke',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'Research topic X', timeout: 60 }),
      })
    );
    expect(result).toBe('Peer result: done');
  });

  it('sends API key in Authorization header', async () => {
    const { a2aInvoke } = await import('@src/extensions/a2a-client.js');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'completed', result: 'done' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await a2aInvoke('http://localhost:3001', 'task', 'secret-key');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer secret-key',
        }),
      })
    );
  });

  it('handles peer error response', async () => {
    const { a2aInvoke } = await import('@src/extensions/a2a-client.js');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(a2aInvoke('http://localhost:3001', 'task'))
      .rejects.toThrow('A2A peer returned 500');
  });

  it('handles peer failure result', async () => {
    const { a2aInvoke } = await import('@src/extensions/a2a-client.js');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'failed', error: 'Task rejected' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(a2aInvoke('http://localhost:3001', 'task'))
      .rejects.toThrow('A2A peer failed: Task rejected');
  });

  it('discovers peer capabilities', async () => {
    const { a2aDiscover } = await import('@src/extensions/a2a-client.js');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'research-agent',
        version: '1.0.0',
        tools: ['search', 'read'],
        protocols: ['a2a-v1'],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const caps = await a2aDiscover('http://localhost:3001');

    expect(caps.name).toBe('research-agent');
    expect(caps.tools).toContain('search');
  });
});
