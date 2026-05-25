import { describe, it, expect, vi } from 'vitest';

/**
 * URL tool guards tests.
 *
 * Verifies that fetch_url and fetchAndExtract call SSRF guard and
 * website blocklist before fetching URLs, returning appropriate
 * error messages when URLs are blocked.
 */

// Mock SSRF guard
vi.mock('@src/security/ssrf-guard.js', () => ({
  isUrlSafe: vi.fn(),
}));

// Mock website blocklist
vi.mock('@src/security/website-blocklist.js', () => ({
  isDomainBlocked: vi.fn(),
}));

// Mock fetch globally to prevent hanging on actual network calls
const mockedFetch = vi.fn(async () => {
  return {
    ok: true,
    status: 200,
    text: async () => '<html><body>Test content</body></html>',
  };
});

// @ts-ignore — mock global fetch
globalThis.fetch = mockedFetch;

describe('fetch_url — SSRF + blocklist integration', () => {
  it('returns SSRF error when isUrlSafe returns unsafe', async () => {
    const { isUrlSafe } = await import('@src/security/ssrf-guard.js');
    const { isDomainBlocked } = await import('@src/security/website-blocklist.js');
    const { fetchAndExtract } = await import('@src/extensions/web-search.js');

    (isUrlSafe as any).mockResolvedValue({ safe: false, reason: 'private network' });
    (isDomainBlocked as any).mockReturnValue(false);

    const result = await fetchAndExtract('http://10.0.0.1/admin', {
      security: { website_blocklist: { enabled: false, domains: [] }, allow_private_urls: false },
    } as any);

    expect(isUrlSafe).toHaveBeenCalled();
    expect(result).toContain('SSRF');
  });

  it('returns blocklist error when isDomainBlocked returns true', async () => {
    const { isUrlSafe } = await import('@src/security/ssrf-guard.js');
    const { isDomainBlocked } = await import('@src/security/website-blocklist.js');
    const { fetchAndExtract } = await import('@src/extensions/web-search.js');

    (isUrlSafe as any).mockResolvedValue({ safe: true });
    (isDomainBlocked as any).mockReturnValue(true);

    const result = await fetchAndExtract('http://evil.com/page', {
      security: { website_blocklist: { enabled: true, domains: ['evil.com'] }, allow_private_urls: false },
    } as any);

    expect(isDomainBlocked).toHaveBeenCalled();
    expect(result).toContain('blocked');
  });

  it('blocklist is checked before SSRF', async () => {
    const { isUrlSafe } = await import('@src/security/ssrf-guard.js');
    const { isDomainBlocked } = await import('@src/security/website-blocklist.js');
    const { fetchAndExtract } = await import('@src/extensions/web-search.js');

    (isDomainBlocked as any).mockReturnValue(true);
    (isUrlSafe as any).mockResolvedValue({ safe: false, reason: 'private' });

    const result = await fetchAndExtract('http://10.0.0.1/admin', {
      security: { website_blocklist: { enabled: true, domains: ['10.0.0.1'] }, allow_private_urls: false },
    } as any);

    // Blocklist error should appear (checked first — no DNS needed)
    expect(result).toContain('blocked');
  });

  it('both blocklist and SSRF return undefined when passed, normal fetch proceeds', async () => {
    const { isUrlSafe } = await import('@src/security/ssrf-guard.js');
    const { isDomainBlocked } = await import('@src/security/website-blocklist.js');
    const { fetchAndExtract } = await import('@src/extensions/web-search.js');

    (isDomainBlocked as any).mockReturnValue(false);
    (isUrlSafe as any).mockResolvedValue({ safe: true });

    // Safe URL should not be blocked (fetch will succeed in test env with mock)
    const result = await fetchAndExtract('https://example.com', {
      security: { website_blocklist: { enabled: true, domains: [] }, allow_private_urls: false },
    } as any);

    // Result should NOT contain SSRF or blocklist error
    expect(result).not.toContain('SSRF');
    expect(result).not.toContain('blocked');
  });
});