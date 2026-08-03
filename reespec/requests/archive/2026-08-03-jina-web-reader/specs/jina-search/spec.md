# Spec — jina_search tool

## Capability

When the Jina sidekick is healthy AND its search route is confirmed available, a
`jina_search` tool is registered that returns search results WITH fetched full page
content (the "search that reads" path), scoped by the website blocklist. The tool is
never registered when the sidekick does not provide the search route — the agent is
never handed a tool that can't return results, and keeps using the working `web_search`
instead. The `jinaSearch()` backing implementation is kept for future builds that add
the route.

## Scenarios

### GIVEN a healthy sidekick whose search route responds OK
WHEN the extension loads
THEN `jina_search` IS registered (probe-gated: `GET {base}/search` returned OK at load)

### GIVEN a registered `jina_search` and a normal query
WHEN `jina_search({ query: 'current reeboot release', limit: 5 })` is called
THEN the tool returns search results including fetched content for the top results
AND the number of results does not exceed `limit`

### GIVEN `sites` is provided
WHEN `jina_search({ query, sites: ['github.com'] })` is called
THEN the request scopes the search to the given sites

### GIVEN a query containing a blocklisted hostname in `sites`
WHEN `jina_search({ query, sites: ['blocked.example'] })` is called
THEN the tool refuses/omits that site, applying the blocklist

### GIVEN a healthy sidekick that does NOT support the search route (probe non-2xx)
WHEN the tools are inspected at load
THEN `jina_search` is NOT registered (the route probe failed)
AND the agent retains the existing `web_search` tool for searching

### GIVEN the sidekick is NOT healthy
WHEN the tools are inspected at load
THEN `jina_search` is not present among the registered tools
