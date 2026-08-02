/**
 * Jina web reader — jina_search tool tests (TDD)
 *
 * Spec: jina-search/spec.md (as amended — never register a tool that can't work)
 *   - returns results with fetched content, respects limit (when search works)
 *   - sites provided scopes the request to those sites
 *   - sites containing a blocklisted hostname refused
 *   - search route unavailable (404/non-2xx) → jina_search NOT registered at all
 *     (never a dead tool; agent keeps the working web_search)
 *   - unhealthy sidekick → jina_search not registered
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('jina_search tool', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function healthyFetch(searchResponse: unknown) {
    return vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/robots.txt')) {
        return { ok: true, status: 200, text: async () => 'ok' };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(searchResponse),
        json: async () => searchResponse,
      };
    });
  }

  async function register(mockFetch: any, config: any) {
    const registered: Map<string, Function> = new Map();
    const mockPi = {
      registerTool: vi.fn((opts: { name: string; execute: Function }) => {
        registered.set(opts.name, opts.execute);
      }),
      on: vi.fn(),
    };
    const mod = await import('@src/extensions/jina-reader.js');
    await mod.default(mockPi as any, config);
    return registered;
  }

  it('returns results with content and respects limit', async () => {
    const searchResponse = {
      data: [
        { title: 'A', url: 'https://a.com', content: 'content A' },
        { title: 'B', url: 'https://b.com', content: 'content B' },
        { title: 'C', url: 'https://c.com', content: 'content C' },
        { title: 'D', url: 'https://d.com', content: 'content D' },
      ],
    };
    vi.stubGlobal('fetch', healthyFetch(searchResponse));

    const registered = await register(vi.mocked(fetch), {
      web: { jina_base_url: 'http://localhost:3000', enabled: true, default_engine: 'auto' },
    });

    const execute = registered.get('jina_search');
    const result = await execute!('call-id', { query: 'current reeboot release', limit: 2 });

    const text = Array.isArray(result.content) ? (result.content[0]?.text ?? '') : result.content;
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeLessThanOrEqual(2);
    expect(parsed[0].content).toBe('content A');
  });

  it('scopes the request to provided sites', async () => {
    const searchResponse = { data: [{ title: 'X', url: 'https://github.com', content: 'c' }] };
    const mockFetch = healthyFetch(searchResponse);
    vi.stubGlobal('fetch', mockFetch);

    const registered = await register(mockFetch, {
      web: { jina_base_url: 'http://localhost:3000', enabled: true, default_engine: 'auto' },
    });

    const execute = registered.get('jina_search');
    await execute!('call-id', { query: 'reeboot', sites: ['github.com'], limit: 5 });

    // The search request URL must include site:github.com (exclude the load-time
    // probe, which uses q=probe, from this assertion).
    const searchCalls = mockFetch.mock.calls
      .map((c: any) => String(c[0]))
      .filter((u: string) => !u.includes('/robots.txt') && !u.includes('q=probe'));
    expect(searchCalls.length).toBe(1);
    expect(searchCalls[0]).toContain('site%3Agithub.com');
  });

  it('refuses sites containing a blocklisted hostname', async () => {
    // No container search call should be made for a blocklisted site.
    const mockFetch = healthyFetch({ data: [] });
    vi.stubGlobal('fetch', mockFetch);

    const registered = await register(mockFetch, {
      web: { jina_base_url: 'http://localhost:3000', enabled: true, default_engine: 'auto' },
      security: { website_blocklist: { enabled: true, domains: ['blocked.example'] } },
    });

    const execute = registered.get('jina_search');
    const result = await execute!('call-id', { query: 'x', sites: ['blocked.example', 'github.com'] });

    const text = Array.isArray(result.content) ? (result.content[0]?.text ?? '') : result.content;
    expect(text).toContain('blocked');
    expect(result.isError).toBe(true);

    // No read/search call should be made for the blocklisted site. Only the
    // load-time probe (q=probe) touches the container.
    const searchCalls = mockFetch.mock.calls
      .map((c: any) => String(c[0]))
      .filter((u: string) => !u.includes('/robots.txt') && !u.includes('q=probe'));
    expect(searchCalls.length).toBe(0);
  });

  it('does NOT register jina_search when the search route is unavailable (non-2xx)', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/robots.txt')) {
        return { ok: true, status: 200, text: async () => 'ok' };
      }
      // /search probe (and any search call) returns non-2xx → route absent
      return { ok: false, status: 404, text: async () => 'not found', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', mockFetch);

    const registered = await register(mockFetch, {
      web: { jina_base_url: 'http://localhost:3000', enabled: true, default_engine: 'auto' },
    });

    // jina_search must not be registered when the route doesn't work
    expect(registered.has('jina_search')).toBe(false);
    // jina_read is unaffected
    expect(registered.has('jina_read')).toBe(true);
  });

  it('does NOT register jina_search when sidekick is unhealthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const registered = await register(vi.fn(), {
      web: { jina_base_url: 'http://localhost:3000', enabled: true, default_engine: 'auto' },
    });
    expect(registered.has('jina_search')).toBe(false);
    expect(registered.has('jina_read')).toBe(false);
  });
});
