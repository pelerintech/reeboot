# SSRF Protection

Reeboot validates destination IPs for all URL-fetching tools (`fetch_url`, `web_search` page content) to prevent Server-Side Request Forgery (SSRF) attacks.

## Configuration

```json
{
  "security": {
    "allow_private_urls": false,
    "website_blocklist": {
      "enabled": false,
      "domains": []
    }
  }
}
```

| Field | Default | Description |
|---|---|---|
| `allow_private_urls` | `false` | Set to `true` to allow private IP addresses (e.g., local Ollama) |
| `website_blocklist.enabled` | `false` | Enable domain blocklist checking |
| `website_blocklist.domains` | `[]` | List of domains to block (supports wildcards) |

## Blocked Destinations

When `allow_private_urls` is `false`, reeboot blocks URLs resolving to:

- **RFC 1918 private networks:** `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- **Loopback:** `127.0.0.0/8`, `::1`
- **Link-local:** `169.254.0.0/16` (includes cloud metadata `169.254.169.254`)
- **CGNAT (RFC 6598):** `100.64.0.0/10`
- **Cloud metadata hostnames:** `metadata.google.internal`, `metadata.goog`

## DNS Resolution

Hostnames are resolved via the system DNS resolver. The resolved IPs are checked against blocked ranges. If DNS fails, the URL is blocked (fail-closed).

## Redirect Chains

Each redirect target in an HTTP redirect chain is re-validated. If a safe URL redirects to a private IP, the redirect target is blocked.

## Website Blocklist

When enabled, the website blocklist provides domain-level access control with wildcard support:

```json
{
  "security": {
    "website_blocklist": {
      "enabled": true,
      "domains": ["*.internal.company.com", "admin.example.com"]
    }
  }
}
```

**Matching rules:**
- Exact match: `evil.com` blocks only `evil.com`
- Wildcard: `*.example.com` blocks `sub.example.com`, `deep.nested.example.com`, and `example.com` itself
- Case-insensitive: `Evil.COM` matches `evil.com`

**Checked first:** The blocklist is checked before SSRF — it's a string comparison with no DNS needed.

## Error Messages

When a URL is blocked:

- **Blocklist:** `"URL blocked by website policy: domain 'evil.com' is in the blocklist"`
- **SSRF:** `"URL blocked by SSRF policy: destination resolves to private network address"`

## Opting Out

Set `allow_private_urls: true` to disable SSRF checks entirely. This is useful for home-network setups with local Ollama instances or internal wikis. This carries risk — only enable if you control your network and trust the agent's tool choices.