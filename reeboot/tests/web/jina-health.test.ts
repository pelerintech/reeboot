/**
 * Jina web reader — health check tests (TDD — written before implementation)
 *
 * Spec: health-check/spec.md
 *   - reachable container → true
 *   - unreachable (connection refused / non-2xx) → false
 *   - slow/hanging → false within bounded timeout
 *   - empty baseUrl → no fetch made, no tools registered downstream
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('checkJinaHealth', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true on a 2xx response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', mockFetch);

    const { checkJinaHealth } = await import('@src/extensions/jina-reader.js');
    const result = await checkJinaHealth('http://localhost:3000');
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/robots.txt',
      expect.objectContaining({ signal: expect.anything() })
    );
  });

  it('returns false on connection refused / fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { checkJinaHealth } = await import('@src/extensions/jina-reader.js');
    const result = await checkJinaHealth('http://localhost:3000');
    expect(result).toBe(false);
  });

  it('returns false on non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { checkJinaHealth } = await import('@src/extensions/jina-reader.js');
    const result = await checkJinaHealth('http://localhost:3000');
    expect(result).toBe(false);
  });

  it('returns false within a bounded timeout for a hanging fetch', async () => {
    // A fetch that never resolves — must be aborted by the timeout signal.
    const mockFetch = vi.fn((_url: string, opts?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          reject(new Error('Aborted'));
        });
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const { checkJinaHealth } = await import('@src/extensions/jina-reader.js');
    const started = Date.now();
    const result = await checkJinaHealth('http://localhost:3000');
    const elapsed = Date.now() - started;

    expect(result).toBe(false);
    expect(elapsed).toBeLessThan(5000);
  });

  it('makes no fetch for an empty baseUrl', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const { checkJinaHealth } = await import('@src/extensions/jina-reader.js');
    const result = await checkJinaHealth('');
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
