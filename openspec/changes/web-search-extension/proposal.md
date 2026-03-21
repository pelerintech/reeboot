## Why

The Phase 1 agent has no ability to search the web. Users expecting an AI assistant to look things up are disappointed. Web search is a foundational capability for a personal agent — research, fact-checking, price monitoring, news — and the extension infrastructure is already in place. Adding it unlocks the most common "wow" moment for new users.

## What Changes

- New bundled pi extension `extensions/web-search.ts` (~200 lines) registered automatically for all users
- Registers `fetch_url` tool for all users regardless of search provider (including `provider = "none"`)
- Registers `web_search` tool when `config.search.provider` is not `"none"`
- 6 search backends: DuckDuckGo (zero config, HTML scraping), Brave, Tavily, Serper, Exa (all API key), SearXNG (self-hosted Docker)
- API key env var fallback: if `config.search.apiKey` is unset, checks `BRAVE_API_KEY` / `TAVILY_API_KEY` etc.
- SearXNG: if container unreachable at startup, logs warning and falls back to DDG automatically
- `fetch_url` uses `@mozilla/readability` + `linkedom` for clean article text extraction from any URL
- All backends follow TDD red/green: failing tests written before each backend implementation
- New npm deps: `@mozilla/readability`, `linkedom` (both pure JS, ~250KB combined)

## Capabilities

### New Capabilities
- `web-search-tool`: `web_search` pi tool — searches the web via configured backend, returns structured results
- `fetch-url-tool`: `fetch_url` pi tool — fetches any URL and returns clean readable text (Readability extraction)
- `search-backends`: 6 interchangeable backend implementations (DDG, Brave, Tavily, Serper, Exa, SearXNG)

### Modified Capabilities

## Impact

- `extensions/web-search.ts`: new file (~200 lines)
- `src/config.ts`: `search` config block already added for wizard; extension reads it
- `tests/web-search.test.ts`: new test file (TDD first)
- New npm deps: `@mozilla/readability`, `linkedom`
- No new Docker requirement for default path (DDG)
- Extension loader: `web-search.ts` added to default extension list in `src/agent-runner/pi-runner.ts`
