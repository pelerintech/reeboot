## ADDED Requirements

### Requirement: DuckDuckGo backend scrapes html.duckduckgo.com with no API key
The DDG backend SHALL fetch `https://html.duckduckgo.com/html/?q=<encoded-query>` with a browser-like User-Agent. It SHALL parse `.result__a` anchor elements for titles and decoded URLs, and `.result__snippet` elements for snippets. It SHALL decode DDG redirect URLs (extract `uddg=` param). It SHALL return an empty array if the HTML structure is not found (not crash).

#### Scenario: DDG returns results
- **WHEN** DDG backend is called with mocked DDG HTML fixture containing 5 results
- **THEN** returns array of 5 objects with title, url (decoded, not DDG redirect), snippet

#### Scenario: DDG HTML structure not found — empty array
- **WHEN** mock response is valid HTML but lacks DDG result structure
- **THEN** returns empty array without throwing

#### Scenario: No API key needed
- **WHEN** DDG backend called without any API key in config or env
- **THEN** call succeeds (no auth failure)

### Requirement: Brave backend calls Search API v1 with X-Subscription-Token header
The Brave backend SHALL call `https://api.search.brave.com/res/v1/web/search` with `q` and `count` query params and `X-Subscription-Token: <key>` header. It SHALL map `data.web.results[].{title, url, description}` to the standard result shape.

#### Scenario: Brave returns results
- **WHEN** Brave backend called with mocked JSON response containing 3 results
- **THEN** returns 3 objects with title, url, snippet (from `description` field)

#### Scenario: Brave 401 — empty array
- **WHEN** mock response is HTTP 401
- **THEN** returns empty array, logs error

### Requirement: Tavily backend uses POST to /search with JSON body
The Tavily backend SHALL POST `{ api_key, query, max_results }` to `https://api.tavily.com/search` and map `data.results[].{title, url, content}`.

#### Scenario: Tavily returns results
- **WHEN** Tavily backend called with mocked response containing 5 results
- **THEN** returns 5 objects; snippet sourced from `content` field

### Requirement: Serper backend uses POST to google.serper.dev/search
The Serper backend SHALL POST `{ q, num }` to `https://google.serper.dev/search` with `X-API-KEY` header and map `data.organic[].{title, link, snippet}`.

#### Scenario: Serper returns results
- **WHEN** Serper backend called with mocked response
- **THEN** returns objects with url from `link` field

### Requirement: Exa backend uses POST to api.exa.ai/search with autoprompt
The Exa backend SHALL POST `{ query, numResults, useAutoprompt: true }` to `https://api.exa.ai/search` with `x-api-key` header and map `data.results[].{title, url, text}`.

#### Scenario: Exa returns results
- **WHEN** Exa backend called with mocked response
- **THEN** snippet is `text` field truncated to 200 chars

### Requirement: SearXNG backend calls local instance JSON API
The SearXNG backend SHALL call `<baseUrl>/search?q=<query>&format=json` and map `data.results[].{title, url, content}`.

#### Scenario: SearXNG returns results
- **WHEN** SearXNG backend called with mocked local server response
- **THEN** returns results mapped from `content` to snippet

### Requirement: SearXNG falls back to DDG if container unreachable at startup
At extension load time, if `config.search.provider = "searxng"`, the extension SHALL send a health-check request to `<baseUrl>/search?q=test&format=json`. If this fails (any error), it SHALL log a warning "SearXNG unreachable at <baseUrl>, falling back to DuckDuckGo" and use the DDG backend for all subsequent `web_search` calls in this session.

#### Scenario: SearXNG unreachable — DDG used
- **WHEN** health-check to SearXNG throws ECONNREFUSED
- **THEN** all subsequent `web_search` calls use DDG backend
- **THEN** warning logged at startup

#### Scenario: SearXNG reachable — SearXNG used
- **WHEN** health-check succeeds
- **THEN** all subsequent `web_search` calls use SearXNG backend
