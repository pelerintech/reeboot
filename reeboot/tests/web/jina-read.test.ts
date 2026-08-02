/**
 * Jina web reader — jina_read backing function tests (TDD)
 *
 * Spec: jina-read/spec.md
 *   - GETs {baseUrl}/{url}
 *   - forwards engine / target_selector / max_tokens as headers when provided
 *   - omits engine when auto/absent
 *   - returns body text on 2xx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('jinaRead', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function okFetch(body = 'hello markdown') {
    return vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => body });
  }

  it("GETs {baseUrl}/{url} and returns body text on 2xx", async () => {
    const mockFetch = okFetch('page content');
    vi.stubGlobal('fetch', mockFetch);

    const { jinaRead } = await import('@src/extensions/jina-reader.js');
    const text = await jinaRead('http://localhost:3000', { url: 'https://example.com/article' });

    expect(text).toBe('page content');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, opts] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('http://localhost:3000/https%3A%2F%2Fexample.com%2Farticle');
    expect(opts).toBeDefined();
  });

  it('omits engine header when engine is auto/absent', async () => {
    const mockFetch = okFetch('text');
    vi.stubGlobal('fetch', mockFetch);

    const { jinaRead } = await import('@src/extensions/jina-reader.js');
    await jinaRead('http://localhost:3000', { url: 'https://example.com/x' });

    const opts = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = (opts?.headers ?? {}) as Record<string, string>;
    expect(headers['x-engine']).toBeUndefined();
  });

  it('forwards engine header when engine explicitly set', async () => {
    const mockFetch = okFetch('text');
    vi.stubGlobal('fetch', mockFetch);

    const { jinaRead } = await import('@src/extensions/jina-reader.js');
    await jinaRead('http://localhost:3000', { url: 'https://example.com/x', engine: 'browser' });

    const opts = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = (opts?.headers ?? {}) as Record<string, string>;
    expect(headers['x-engine']).toBe('browser');
  });

  it('forwards target_selector and max_tokens headers when provided', async () => {
    const mockFetch = okFetch('text');
    vi.stubGlobal('fetch', mockFetch);

    const { jinaRead } = await import('@src/extensions/jina-reader.js');
    await jinaRead('http://localhost:3000', {
      url: 'https://example.com/x',
      target_selector: 'main article',
      max_tokens: 5000,
    });

    const opts = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = (opts?.headers ?? {}) as Record<string, string>;
    expect(headers['x-target-selector']).toBe('main article');
    expect(headers['x-max-tokens']).toBe('5000');
  });

  it('does not send engine header when default_engine is auto', async () => {
    const mockFetch = okFetch('text');
    vi.stubGlobal('fetch', mockFetch);

    const { jinaRead } = await import('@src/extensions/jina-reader.js');
    await jinaRead('http://localhost:3000', { url: 'https://example.com/x' }, 'auto');

    const opts = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = (opts?.headers ?? {}) as Record<string, string>;
    expect(headers['x-engine']).toBeUndefined();
  });
});
