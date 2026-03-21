# Brief: web-search-fix

## What

Fix two bugs that prevent web search from working:

1. **Tool never registered**: `extensions/web-search.ts` calls `pi.getConfig()` which
   does not exist on pi's `ExtensionAPI`. This returns `undefined`, causing
   `searchConfig.provider` to default to `"none"`, which causes the extension to exit
   early without registering the `web_search` tool. The model then responds "I can't
   browse the internet" because the tool literally does not exist in the session.

2. **SearXNG not detected on non-default port**: The wizard's SearXNG subflow only
   starts a new container — it never probes for an already-running SearXNG instance.
   Users with SearXNG running on a non-standard port (e.g. 7777, 9090) are silently
   missed and fall back to DuckDuckGo.

## Why

Both bugs mean users who configured web search get no web search. The first bug
affects 100% of users regardless of provider. The second affects users who already
run SearXNG (self-hosters, pi users with pi-searxng extension, etc.).

## Goals

- `web_search` tool is registered in every session where `config.search.provider ≠ "none"`
- DuckDuckGo works out of the box with zero config (provider="duckduckgo")
- Wizard detects already-running SearXNG containers via `docker ps` and offers them
- User can confirm a detected SearXNG or let reeboot start its own
- `fetch_url` tool is always registered (already works, preserve this)

## Non-goals

- Changing which search providers are supported
- Auto-detection of SearXNG on arbitrary ports without Docker (port scanning)
- Fixing the SearXNG wizard flow for starting new containers (already works)

## Impact

- Fixes: agent refusing all web search requests despite search being configured
- Fixes: SearXNG users having to manually edit config.json after setup
- Enables: reliable web search as a first-class capability from first run
