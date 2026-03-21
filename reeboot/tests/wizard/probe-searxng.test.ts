import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('probeSearXNG', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns null when all ports fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    const { probeSearXNG } = await import('@src/wizard/probe-searxng.js');
    const result = await probeSearXNG();
    expect(result).toBeNull();
  });

  it('returns first responding URL when port 8080 responds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], query: 'test' }),
    }));
    const { probeSearXNG } = await import('@src/wizard/probe-searxng.js');
    const result = await probeSearXNG();
    expect(result).toBe('http://localhost:8080');
  });

  it('skips port 8080 when it times out and returns 8888', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes('8080')) return Promise.reject(new Error('timeout'));
      return Promise.resolve({ ok: true, json: async () => ({ results: [] }) });
    }));
    const { probeSearXNG } = await import('@src/wizard/probe-searxng.js');
    const result = await probeSearXNG();
    expect(result).toBe('http://localhost:8888');
  });

  it('rejects false positive — JSON without results key', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes('8080')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: 'something else' }) });
      }
      return Promise.reject(new Error('not reachable'));
    }));
    const { probeSearXNG } = await import('@src/wizard/probe-searxng.js');
    const result = await probeSearXNG();
    expect(result).toBeNull();
  });

  it('tries all three ports: 8080, 8888, 4000', async () => {
    const calledUrls: string[] = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      calledUrls.push(url);
      return Promise.reject(new Error('nope'));
    }));
    const { probeSearXNG } = await import('@src/wizard/probe-searxng.js');
    await probeSearXNG();
    expect(calledUrls.some(u => u.includes('8080'))).toBe(true);
    expect(calledUrls.some(u => u.includes('8888'))).toBe(true);
    expect(calledUrls.some(u => u.includes('4000'))).toBe(true);
  });
});
