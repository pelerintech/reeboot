/**
 * Jina web reader — loader wiring tests (TDD)
 *
 * The jina-reader factory should be wired through getBundledFactories following the
 * web-search pattern. Whether tools are actually registered is decided by the
 * extension itself based on config.web + health check.
 *
 *   - base_url unset + enabled → jina-reader effectively no-op (no jina_read)
 *   - base_url set + enabled:false → no jina_read
 *   - base_url set + enabled:true (healthy) → jina_read IS registered (via withAdapter path)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('loader wiring for jina-reader', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function runAllFactories(config: any) {
    const registeredTools: string[] = [];
    const mockPi = {
      registerTool: vi.fn((opts: { name: string }) => { registeredTools.push(opts.name); }),
      on: vi.fn(),
    };

    const { getBundledFactories } = await import('@src/extensions/loader.js');
    const factories = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, config);

    for (const factory of factories) {
      try { await (factory as any)(mockPi); } catch { /* ignore unrelated factory errors */ }
    }
    return registeredTools;
  }

  it('does not register jina_read when jina_base_url is unset', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unused')));
    const tools = await runAllFactories({ web: { jina_base_url: '', enabled: true } });
    expect(tools).not.toContain('jina_read');
  });

  it('does not register jina_read when web.enabled is false (base_url set)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const tools = await runAllFactories({ web: { jina_base_url: 'http://localhost:3000', enabled: false } });
    expect(tools).not.toContain('jina_read');
  });

  it('registers jina_read when jina_base_url set + enabled (healthy sidekick)', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/robots.txt')) return { ok: true, status: 200, text: async () => 'ok' };
      return { ok: true, status: 200, text: async () => 'content' };
    });
    vi.stubGlobal('fetch', mockFetch);

    const tools = await runAllFactories({ web: { jina_base_url: 'http://localhost:3000', enabled: true } });
    expect(tools).toContain('jina_read');
    expect(tools).toContain('jina_search');
  });

  it('excludes the jina-reader factory when extensions.core.jina_reader is false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/robots.txt')) return { ok: true, status: 200, text: async () => 'ok' };
      return { ok: true, status: 200, text: async () => 'content' };
    }));

    const tools = await runAllFactories({
      web: { jina_base_url: 'http://localhost:3000', enabled: true },
      extensions: { core: { jina_reader: false } },
    });
    expect(tools).not.toContain('jina_read');
  });
});
