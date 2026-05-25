# Spec — website-blocklist

Operators can block specific domains and wildcard patterns from being accessed by URL-capable tools.

## Scenarios

### 1. Blocks exact domain match

**GIVEN** `security.website_blocklist` is `{ enabled: true, domains: ["evil.com"] }`
**WHEN** the agent fetches `"https://evil.com/page"`
**THEN** the URL is blocked with "URL blocked by website policy: domain 'evil.com' is in the blocklist"

### 2. Blocks wildcard domain match

**GIVEN** `security.website_blocklist` has `domains: ["*.internal.company.com"]`
**WHEN** the agent fetches `"https://wiki.internal.company.com/"`
**THEN** the URL is blocked

### 3. Blocks deep subdomain wildcard

**GIVEN** `security.website_blocklist` has `domains: ["*.company.com"]`
**WHEN** the agent fetches `"https://deep.nested.sub.company.com/api"`
**THEN** the URL is blocked

### 4. Allows non-matching domains

**GIVEN** `security.website_blocklist` has `domains: ["evil.com"]`
**WHEN** the agent fetches `"https://safe-site.com/page"`
**THEN** the URL is allowed

### 5. No-op when disabled

**GIVEN** `security.website_blocklist.enabled` is `false`
**WHEN** the agent fetches any URL
**THEN** no blocklist check is performed

### 6. Blocklist checked before SSRF

**GIVEN** blocklist is enabled and a URL matches both blocklist and is a private IP
**WHEN** the tool validates the URL
**THEN** the blocklist rejection fires first (cheaper check, no DNS resolution)

### 7. Case-insensitive domain matching

**GIVEN** blocklist has `"Evil.COM"` and the agent fetches `"http://evil.com/"`
**THEN** the URL is blocked (case-insensitive match)