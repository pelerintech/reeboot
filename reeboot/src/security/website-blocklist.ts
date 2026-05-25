/**
 * Website Blocklist
 *
 * Checks whether a hostname matches a configured blocklist.
 * Supports exact matches, wildcards, and is case-insensitive.
 */

export interface WebsiteBlocklistConfig {
  enabled: boolean;
  domains: string[];
}

/**
 * Check if a hostname is in the blocklist.
 * Returns true if the domain should be blocked.
 */
export function isDomainBlocked(hostname: string, blocklist: WebsiteBlocklistConfig): boolean {
  if (!blocklist.enabled) return false;
  if (!blocklist.domains.length) return false;

  const lowerHost = hostname.toLowerCase();

  for (const entry of blocklist.domains) {
    const lowerEntry = entry.toLowerCase();

    if (lowerEntry.startsWith('*.')) {
      // Wildcard: match subdomains and the parent domain
      const suffix = lowerEntry.slice(2); // e.g., 'example.com'
      if (lowerHost === suffix || lowerHost.endsWith('.' + suffix)) {
        return true;
      }
    } else {
      // Exact match
      if (lowerHost === lowerEntry) {
        return true;
      }
    }
  }

  return false;
}