## 1. Dependencies & Test Infrastructure (RED)

- [x] 1.1 Add `@mozilla/readability` and `linkedom` to `package.json` dependencies
- [x] 1.2 Write failing tests for `fetch_url`: always-registered, article extraction, non-article fallback, HTTP 404 error string, network failure error string, User-Agent header sent
- [x] 1.3 Write failing tests for DDG backend: 5-result fixture parse, decoded URLs, missing structure → empty array, no API key required
- [x] 1.4 Write failing tests for Brave backend: 3-result mock, snippet from `description`, 401 → empty array + log
- [x] 1.5 Write failing tests for Tavily backend: 5-result mock, snippet from `content`
- [x] 1.6 Write failing tests for Serper backend: results mock, url from `link` field
- [x] 1.7 Write failing tests for Exa backend: results mock, snippet truncated to 200 chars
- [x] 1.8 Write failing tests for SearXNG backend: results mock, fallback-to-DDG on ECONNREFUSED, healthy → SearXNG used
- [x] 1.9 Write failing tests for `web_search` tool registration: registered when provider ≠ none, not registered when none/absent, API key from config, env var fallback, no-key warning + empty array, limit respected, backend error → empty array

## 2. fetch_url Implementation (GREEN)

- [x] 2.1 Implement `fetchAndExtract(url)` in `extensions/web-search.ts` using `linkedom` + `@mozilla/readability`; ensure 1.2 tests pass
- [x] 2.2 Register `fetch_url` tool in extension — always registered regardless of provider; ensure registration scenarios in 1.9 pass

## 3. Search Backend Implementations (GREEN — one backend at a time, TDD)

- [x] 3.1 Implement DDG backend `searchDuckDuckGo(query, limit)`; ensure 1.3 tests pass
- [x] 3.2 Implement Brave backend `searchBrave(query, apiKey, limit)`; ensure 1.4 tests pass
- [x] 3.3 Implement Tavily backend `searchTavily(query, apiKey, limit)`; ensure 1.5 tests pass
- [x] 3.4 Implement Serper backend `searchSerper(query, apiKey, limit)`; ensure 1.6 tests pass
- [x] 3.5 Implement Exa backend `searchExa(query, apiKey, limit)`; ensure 1.7 tests pass
- [x] 3.6 Implement SearXNG backend `searchSearXNG(query, baseUrl, limit)` + startup health-check with DDG fallback; ensure 1.8 tests pass

## 4. web_search Tool Wiring (GREEN)

- [x] 4.1 Implement `resolveApiKey(config)` — config key then env var fallback; ensure API key scenarios in 1.9 pass
- [x] 4.2 Implement `searchBackend(provider, config, params)` — dispatches to correct backend; ensure all dispatch scenarios in 1.9 pass
- [x] 4.3 Register `web_search` tool conditionally (provider ≠ none); ensure registration scenarios in 1.9 pass
- [x] 4.4 Wire extension into `src/agent-runner/pi-runner.ts` default extension list

## 5. Integration & Documentation

- [x] 5.1 Save DDG HTML fixture to `tests/fixtures/ddg-response.html` for snapshot test stability
- [x] 5.2 Run full test suite — all 1.2–1.9 tests must be green
- [x] 5.3 Update `README.md` — add Web Search section documenting all 6 providers, env vars, free tiers
- [x] 5.4 Manual smoke test: configure DDG in config, start agent, ask "what is the current TypeScript version?" — agent should use `web_search` and return a result
