/**
 * Jina web reader — before_agent_start guidance tests (TDD)
 *
 * Spec: agent-guidance/spec.md
 *   - healthy sidekick → returned prompt = event.systemPrompt + block, contains
 *     jina_read & jina_search, prefers jina_read over fetch_url, jina_search over
 *     web_search, fallback on Jina errors.
 *   - unhealthy/empty sidekick → prompt unchanged.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('jina before_agent_start guidance', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function healthyFetch() {
    return vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
  }

  async function captureHandler(config: any) {
    const handlers: Record<string, Function> = {};
    const mockPi = {
      registerTool: vi.fn(),
      on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }),
    };
    const mod = await import('@src/extensions/jina-reader.js');
    await mod.default(mockPi as any, config);
    return handlers;
  }

  it('composes a guidance block onto the existing prompt when healthy', async () => {
    vi.stubGlobal('fetch', healthyFetch());

    const handlers = await captureHandler({
      web: { jina_base_url: 'http://localhost:3000', enabled: true, default_engine: 'auto' },
    });

    const beforeAgent = handlers['before_agent_start'];
    expect(beforeAgent).toBeDefined();

    const base = 'YOU ARE A HELPFUL AGENT.';
    const result = await beforeAgent({ systemPrompt: base });

    expect(result.systemPrompt).toContain(base);
    expect(result.systemPrompt).not.toBe(base); // block was appended
    expect(result.systemPrompt).toContain('jina_read');
    expect(result.systemPrompt).toContain('jina_search');

    // Decision rules
    expect(result.systemPrompt).toMatch(/jina_read.*fetch_url/s);
    expect(result.systemPrompt).toMatch(/jina_search.*web_search/s);
    expect(result.systemPrompt).toMatch(/fall back/i);
  });

  it('returns the prompt unchanged when sidekick is unhealthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const handlers = await captureHandler({
      web: { jina_base_url: 'http://localhost:3000', enabled: true, default_engine: 'auto' },
    });

    // No tools registered → no guidance handler should be present
    expect(handlers['before_agent_start']).toBeUndefined();
  });

  it('returns the prompt unchanged when jina_base_url is empty', async () => {
    vi.stubGlobal('fetch', healthyFetch());

    const handlers = await captureHandler({
      web: { jina_base_url: '', enabled: true, default_engine: 'auto' },
    });

    expect(handlers['before_agent_start']).toBeUndefined();
  });

  it('injects no guidance when web.enabled is false even with base_url set', async () => {
    vi.stubGlobal('fetch', healthyFetch());

    const handlers = await captureHandler({
      web: { jina_base_url: 'http://localhost:3000', enabled: false, default_engine: 'auto' },
    });

    expect(handlers['before_agent_start']).toBeUndefined();
  });

  it('omits jina_search from the prompt when the search route is unavailable', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/robots.txt')) return { ok: true, status: 200, text: async () => 'ok' };
      // /search probe returns non-2xx → search unavailable
      return { ok: false, status: 400, text: async () => 'bad', json: async () => ({}) };
    });
    vi.stubGlobal('fetch', mockFetch);

    const handlers = await captureHandler({
      web: { jina_base_url: 'http://localhost:3000', enabled: true, default_engine: 'auto' },
    });

    const beforeAgent = handlers['before_agent_start'];
    expect(beforeAgent).toBeDefined();
    const result = await beforeAgent({ systemPrompt: 'BASE' });

    // jina_read guidance present, jina_search guidance absent
    expect(result.systemPrompt).toContain('jina_read');
    expect(result.systemPrompt).not.toContain('jina_search');
  });
});
