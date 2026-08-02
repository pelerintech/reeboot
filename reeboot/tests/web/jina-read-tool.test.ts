/**
 * Jina web reader — jina_read tool registration (TDD)
 *
 * Spec: jina-read/spec.md — GIVEN the sidekick is NOT healthy (not registered),
 * THEN jina_read is not present among the registered tools. And when healthy +
 * jina_base_url set, jina_read IS registered with a promptSnippet.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('jina_read tool registration', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function healthyFetch() {
    return vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/robots.txt')) {
        return { ok: true, status: 200, text: async () => 'ok' };
      }
      return { ok: true, status: 200, text: async () => 'content' };
    });
  }

  it('registers jina_read with a promptSnippet when sidekick is healthy + base_url set', async () => {
    vi.stubGlobal('fetch', healthyFetch());

    const registeredTools: Array<Record<string, any>> = [];
    const mockPi = {
      registerTool: vi.fn((opts: any) => { registeredTools.push(opts); }),
      on: vi.fn(),
    };

    const mod = await import('@src/extensions/jina-reader.js');
    await mod.default(mockPi as any, {
      web: { jina_base_url: 'http://localhost:3000', enabled: true, default_engine: 'auto' },
    });

    const jinaRead = registeredTools.find((t) => t.name === 'jina_read');
    expect(jinaRead).toBeDefined();
    expect(jinaRead.promptSnippet).toBeTruthy();
    expect(typeof jinaRead.description).toBe('string');
    expect(jinaRead.parameters).toBeDefined();
    expect(typeof jinaRead.execute).toBe('function');
  });

  it('does NOT register jina_read when sidekick is unhealthy (health check fails)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const registeredTools: Array<Record<string, any>> = [];
    const mockPi = {
      registerTool: vi.fn((opts: any) => { registeredTools.push(opts); }),
      on: vi.fn(),
    };

    const mod = await import('@src/extensions/jina-reader.js');
    await mod.default(mockPi as any, {
      web: { jina_base_url: 'http://localhost:3000', enabled: true, default_engine: 'auto' },
    });

    const names = registeredTools.map((t) => t.name);
    expect(names).not.toContain('jina_read');
  });

  it('does NOT register jina_read when jina_base_url is empty (no sidekick)', async () => {
    vi.stubGlobal('fetch', healthyFetch());

    const registeredTools: Array<Record<string, any>> = [];
    const mockPi = {
      registerTool: vi.fn((opts: any) => { registeredTools.push(opts); }),
      on: vi.fn(),
    };

    const mod = await import('@src/extensions/jina-reader.js');
    await mod.default(mockPi as any, {
      web: { jina_base_url: '', enabled: true, default_engine: 'auto' },
    });

    const names = registeredTools.map((t) => t.name);
    expect(names).not.toContain('jina_read');
    // No health-check fetch should be made for an empty base url
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
