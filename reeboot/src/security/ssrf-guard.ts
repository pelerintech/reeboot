/**
 * SSRF Guard
 *
 * Validates that a URL's destination IP is not in private, loopback,
 * link-local, CGNAT, or cloud metadata ranges before allowing a fetch.
 *
 * Fail-closed: if DNS resolution fails, the URL is blocked.
 */

import dns from 'dns';

// ─── Blocked ranges ──────────────────────────────────────────────────────────

interface IpRange {
  name: string;
  test: (ip: string) => boolean;
}

const BLOCKED_RANGES: IpRange[] = [
  // RFC 1918 — private networks
  {
    name: 'private network (RFC 1918, 10.0.0.0/8)',
    test: (ip) => ip.startsWith('10.'),
  },
  {
    name: 'private network (RFC 1918, 172.16.0.0/12)',
    test: (ip) => {
      if (!ip.startsWith('172.')) return false;
      const second = parseInt(ip.split('.')[1], 10);
      return second >= 16 && second <= 31;
    },
  },
  {
    name: 'private network (RFC 1918, 192.168.0.0/16)',
    test: (ip) => ip.startsWith('192.168.'),
  },
  // Loopback
  {
    name: 'loopback address',
    test: (ip) => ip === '::1' || ip.startsWith('127.'),
  },
  // Link-local (includes cloud metadata 169.254.169.254)
  {
    name: 'link-local address',
    test: (ip) => ip.startsWith('169.254.'),
  },
  // CGNAT / shared address space (RFC 6598)
  {
    name: 'CGNAT / shared address space (100.64.0.0/10)',
    test: (ip) => {
      if (!ip.startsWith('100.')) return false;
      const second = parseInt(ip.split('.')[1], 10);
      return second >= 64 && second <= 127;
    },
  },
  // Unspecified address
  {
    name: 'unspecified address (0.0.0.0)',
    test: (ip) => ip === '0.0.0.0',
  },
  // IPv6 unique local address (ULA, fc00::/7)
  {
    name: 'IPv6 unique local address (fc00::/7)',
    test: (ip) => ip.includes(':') && /^f[c-d]/i.test(ip),
  },
  // IPv6 link-local (fe80::/10)
  {
    name: 'IPv6 link-local address (fe80::/10)',
    test: (ip) => ip.includes(':') && /^fe[89a-b]/i.test(ip),
  },
];

// Cloud metadata hostnames (checked before DNS)
const CLOUD_METADATA_HOSTNAMES = [
  'metadata.google.internal',
  'metadata.goog',
];

// ─── isUrlSafe ───────────────────────────────────────────────────────────────

export interface SsrfResult {
  safe: boolean;
  reason?: string;
}

export async function isUrlSafe(
  urlStr: string,
  opts?: { allowPrivate?: boolean },
): Promise<SsrfResult> {
  // Parse URL to extract hostname
  let hostname: string;
  try {
    const parsed = new URL(urlStr);
    hostname = parsed.hostname;
  } catch {
    return { safe: false, reason: 'invalid URL' };
  }

  // Strip IPv6 brackets for IP range checks
  let ipv6Stripped = hostname;
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    ipv6Stripped = hostname.slice(1, -1);
  }

  // Check cloud metadata hostnames (case-insensitive)
  // Check both with and without brackets for IPv6
  const lowerHost = hostname.toLowerCase();
  const lowerStripped = ipv6Stripped.toLowerCase();
  for (const metaHost of CLOUD_METADATA_HOSTNAMES) {
    if (lowerHost === metaHost || lowerStripped === metaHost) {
      return { safe: false, reason: `cloud metadata endpoint: ${hostname}` };
    }
  }

  // Resolve hostname to IP
  let address: string;
  try {
    const result = await dns.promises.lookup(ipv6Stripped, { family: 0 }); // 0 = any family
    address = result.address;
  } catch {
    // DNS failure — fail-closed
    return { safe: false, reason: `DNS resolution failed for ${hostname}` };
  }

  // If allowPrivate is set, skip IP checks
  if (opts?.allowPrivate) {
    return { safe: true };
  }

  // Normalise IPv4-mapped IPv6 addresses (::ffff:x.x.x.x) before range checks.
  // Node's URL parser normalises dotted-quad IPv4 to hex (::ffff:a00:1 for 10.0.0.1),
  // so we must decode the mapped bytes back to dotted-quad.
  let norm = address;
  const v4mapped = address.match(/^::ffff:(.+)$/i);
  if (v4mapped) {
    const rest = v4mapped[1];
    // If the mapped part is a plain dotted-quad, use it directly.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(rest)) {
      norm = rest;
    } else {
      // Otherwise it's hex-encoded (e.g. a00:1 → 10.0.0.1).
      // Split on ':', parse each segment as two bytes.
      const parts = rest.split(':');
      const bytes: number[] = [];
      for (const p of parts) {
        const num = parseInt(p, 16);
        bytes.push((num >> 8) & 0xff, num & 0xff);
      }
      norm = bytes.join('.');
    }
  }

  // Check against blocked ranges (test both original and normalised)
  for (const range of BLOCKED_RANGES) {
    if (range.test(address) || range.test(norm)) {
      return { safe: false, reason: `URL blocked by SSRF policy: destination resolves to ${range.name}` };
    }
  }

  return { safe: true };
}