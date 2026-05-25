# Spec — ssrf-protection

All URL-capable tools validate destination IPs before fetching. Private, loopback, link-local, CGNAT, and cloud metadata addresses are blocked.

## Scenarios

### 1. Blocks private network IPs (RFC 1918)

**GIVEN** `security.allow_private_urls` is `false` (default)
**WHEN** the agent calls `web_search` or `fetch_url` with URL `"http://10.0.0.1/admin"`
**THEN** the URL is blocked with error "URL blocked by SSRF policy: destination resolves to private network address"

### 2. Blocks loopback

**GIVEN** an external web page redirects the agent to `"http://127.0.0.1:8080/secrets"`
**WHEN** the tool follows the redirect
**THEN** the redirected URL is validated and blocked

### 3. Blocks cloud metadata endpoint

**GIVEN** the agent is directed to fetch `"http://169.254.169.254/latest/meta-data/"`
**WHEN** SSRF validation runs
**THEN** the URL is blocked (link-local address)

### 4. Blocks cloud metadata hostname

**GIVEN** the agent fetches `"http://metadata.google.internal/"`
**WHEN** the hostname is resolved
**THEN** the URL is blocked with "cloud metadata endpoint"

### 5. Allows public URLs

**GIVEN** the agent fetches `"https://example.com/page"`
**WHEN** the hostname resolves to a public IP
**THEN** the URL is allowed

### 6. Allows private URLs when opted in

**GIVEN** `security.allow_private_urls` is `true`
**WHEN** the agent fetches `"http://192.168.1.1/status"`
**THEN** the URL is allowed (operator has accepted the risk)

### 7. Re-validates redirect chains

**GIVEN** the agent fetches `"https://safe-site.com/page"` which redirects to `"http://10.0.0.1/internal"`
**WHEN** the HTTP client follows the redirect
**THEN** the redirected URL is blocked (redirect target is private)

### 8. Blocks CGNAT addresses

**GIVEN** the agent fetches a URL resolving to `100.64.0.1`
**WHEN** SSRF validation runs
**THEN** the URL is blocked (CGNAT / shared address space)

### 9. Fails closed on DNS failure

**GIVEN** a URL's hostname cannot be resolved
**WHEN** SSRF validation calls `dns.lookup()`
**THEN** the URL is blocked — fail-closed