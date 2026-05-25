import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * SSRF guard tests.
 *
 * Verifies that isUrlSafe() blocks private, loopback, link-local,
 * CGNAT, and cloud metadata addresses, while allowing public URLs.
 *
 * DNS is mocked to provide predictable IPs for hostname-based URLs.
 */

// Mock DNS promises.lookup to return known IPs for hostname tests
vi.mock('dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dns')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      promises: {
        ...actual.default.promises,
        lookup: vi.fn(async (hostname: string, _opts?: any) => {
          // Direct IP addresses return themselves
          const stripped = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
          const isIPv4 = /^\d+\.\d+\.\d+\.\d+$/.test(stripped);
          const isIPv6 = stripped.includes(':');
          if (isIPv4) return { address: stripped, family: 4 };
          if (isIPv6) return { address: stripped, family: 6 };
          // Known public hosts
          if (hostname === 'example.com' || hostname === 'www.example.com') return { address: '93.184.216.34', family: 4 };
          if (hostname === 'github.com') return { address: '140.82.121.3', family: 4 };
          // Cloud metadata hostnames — handled before DNS in isUrlSafe
          if (hostname === 'metadata.google.internal' || hostname === 'metadata.goog') return { address: '169.254.169.254', family: 4 };
          // DNS failure for unknown hosts
          throw new Error(`ENOTFOUND ${hostname}`);
        }),
      },
    },
  };
});

describe('SSRF guard — isUrlSafe', () => {
  async function checkUrl(url: string, opts?: { allowPrivate?: boolean }): Promise<{ safe: boolean; reason?: string }> {
    const mod = await import('@src/security/ssrf-guard.js');
    return mod.isUrlSafe(url, opts);
  }

  // Public URLs should be safe
  it('allows public URLs (example.com)', async () => {
    const result = await checkUrl('https://example.com/page');
    expect(result.safe).toBe(true);
  });

  it('allows public URLs (github.com)', async () => {
    const result = await checkUrl('https://github.com/repo');
    expect(result.safe).toBe(true);
  });

  // Private network IPs (RFC 1918)
  it('blocks 10.x.x.x (24-bit block)', async () => {
    const result = await checkUrl('http://10.0.0.1/admin');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/private/i);
  });

  it('blocks 172.16-31.x.x (20-bit block)', async () => {
    const result = await checkUrl('http://172.16.0.1/');
    expect(result.safe).toBe(false);
  });

  it('blocks 192.168.x.x (16-bit block)', async () => {
    const result = await checkUrl('http://192.168.1.1/status');
    expect(result.safe).toBe(false);
  });

  // Loopback
  it('blocks 127.x.x.x (loopback)', async () => {
    const result = await checkUrl('http://127.0.0.1:8080/secrets');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/loopback/i);
  });

  it('blocks ::1 (IPv6 loopback)', async () => {
    const result = await checkUrl('http://[::1]:8080/');
    expect(result.safe).toBe(false);
  });

  // Link-local (cloud metadata)
  it('blocks 169.254.x.x (link-local)', async () => {
    const result = await checkUrl('http://169.254.169.254/latest/meta-data/');
    expect(result.safe).toBe(false);
  });

  // CGNAT
  it('blocks 100.64-127.x.x (CGNAT)', async () => {
    const result = await checkUrl('http://100.64.0.1/');
    expect(result.safe).toBe(false);
  });

  // Cloud metadata hostnames
  it('blocks metadata.google.internal', async () => {
    const result = await checkUrl('http://metadata.google.internal/');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/metadata/i);
  });

  // allowPrivate option
  it('allows private URLs when allowPrivate is true', async () => {
    const result = await checkUrl('http://192.168.1.1/status', { allowPrivate: true });
    expect(result.safe).toBe(true);
  });

  it('allows public URLs even when allowPrivate is false (default)', async () => {
    const result = await checkUrl('https://example.com');
    expect(result.safe).toBe(true);
  });

  // Edge cases: direct IP URLs
  it('blocks private IP in direct IP URL', async () => {
    const result = await checkUrl('http://10.10.10.10/api');
    expect(result.safe).toBe(false);
  });

  it('allows public IP in direct IP URL', async () => {
    const result = await checkUrl('http://8.8.8.8/');
    expect(result.safe).toBe(true);
  });

  // DNS failure → fail-closed
  it('blocks on DNS failure (fail-closed)', async () => {
    const result = await checkUrl('http://does-not-exist.invalid/page');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/DNS/i);
  });
});