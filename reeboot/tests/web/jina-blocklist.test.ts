/**
 * Jina web reader — blocklist enforcement before delegation (TDD)
 *
 * Spec: jina-read/spec.md — GIVEN a URL whose hostname is in the website
 * blocklist, WHEN jina_read is called THEN the tool returns a block error AND
 * NO HTTP request is made to the container.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('jina_read blocklist enforcement', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a block error and never hits the container for a blocklisted hostname', async () => {
    // Only the health-check /robots.txt call succeeds; any real read would also
    // hit the container. We track ALL fetch calls to assert none go to the read path.
    const fetchCalls: string[] = [];
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      fetchCalls.push(String(url));
      if (String(url).includes('/robots.txt')) {
        return { ok: true, status: 200, text: async () => 'ok' };
      }
      return { ok: true, status: 200, text: async () => 'unexpected read' };
    });
    vi.stubGlobal('fetch', mockFetch);

    const config = {
      web: { jina_base_url: 'http://localhost:3000', enabled: true, default_engine: 'auto' },
      security: {
        website_blocklist: { enabled: true, domains: ['blocked.example'] },
      },
    };

    const registered: Map<string, Function> = new Map();
    const mockPi = {
      registerTool: vi.fn((opts: { name: string; execute: Function }) => {
        registered.set(opts.name, opts.execute);
      }),
      on: vi.fn(),
    };

    const mod = await import('@src/extensions/jina-reader.js');
    await mod.default(mockPi as any, config);

    const execute = registered.get('jina_read');
    expect(execute).toBeDefined();

    const callsBefore = fetchCalls.length;
    const result = await execute!('call-id', { url: 'https://blocked.example/somepage' });

    // Block error returned
    const text = Array.isArray(result.content)
      ? (result.content[0]?.text ?? '')
      : result.content;
    expect(text).toContain('blocked');
    expect(result.isError).toBe(true);

    // No new HTTP call to the container was made for the read
    const readCalls = fetchCalls.slice(callsBefore);
    expect(readCalls.length).toBe(0);
    expect(readCalls.some((u) => u.includes('/blocked.example'))).toBe(false);
  });

  it('does allow reads for a non-blocklisted hostname', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/robots.txt')) {
        return { ok: true, status: 200, text: async () => 'ok' };
      }
      return { ok: true, status: 200, text: async () => 'allowed content' };
    });
    vi.stubGlobal('fetch', mockFetch);

    const config = {
      web: { jina_base_url: 'http://localhost:3000', enabled: true, default_engine: 'auto' },
      security: { website_blocklist: { enabled: true, domains: ['blocked.example'] } },
    };

    const registered: Map<string, Function> = new Map();
    const mockPi = {
      registerTool: vi.fn((opts: { name: string; execute: Function }) => {
        registered.set(opts.name, opts.execute);
      }),
      on: vi.fn(),
    };

    const mod = await import('@src/extensions/jina-reader.js');
    await mod.default(mockPi as any, config);

    const execute = registered.get('jina_read');
    const result = await execute!('call-id', { url: 'https://example.com/ok' });

    const text = Array.isArray(result.content) ? (result.content[0]?.text ?? '') : result.content;
    expect(text).toContain('allowed content');
    expect(result.isError).toBeFalsy();
  });
});
