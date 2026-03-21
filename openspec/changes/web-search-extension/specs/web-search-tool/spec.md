## ADDED Requirements

### Requirement: web_search tool registered when provider is not "none"
The extension SHALL register a `web_search` tool with the pi agent when `config.search.provider` is any value other than `"none"`. The tool SHALL NOT be registered when provider is `"none"` or when `config.search` is absent.

#### Scenario: Tool registered for DDG
- **WHEN** extension loads with `config.search.provider = "duckduckgo"`
- **THEN** `web_search` tool is available to the agent

#### Scenario: Tool not registered when provider is none
- **WHEN** extension loads with `config.search.provider = "none"`
- **THEN** `web_search` tool is NOT registered; `fetch_url` IS registered

#### Scenario: Tool not registered when search config absent
- **WHEN** extension loads with no `config.search` block
- **THEN** `web_search` tool is NOT registered; `fetch_url` IS registered

### Requirement: web_search returns array of results with title, url, snippet
The `web_search` tool SHALL accept `query: string` and optional `limit: number` (default 10, max 20). It SHALL return a JSON array of objects: `{ title: string, url: string, snippet: string }`. On backend error it SHALL return an empty array and log the error, not throw.

#### Scenario: Successful search returns results
- **WHEN** `web_search` is called with `query = "TypeScript tutorial"`
- **THEN** returns array of at least 1 result, each with non-empty `title`, `url`, `snippet`

#### Scenario: Empty query returns empty array
- **WHEN** `web_search` is called with empty string query
- **THEN** returns empty array without calling the backend

#### Scenario: Backend error returns empty array
- **WHEN** the backend HTTP call fails (network error, 5xx)
- **THEN** returns empty array; error is logged; no exception thrown to agent

#### Scenario: Limit respected
- **WHEN** `web_search` is called with `limit = 3`
- **THEN** returns at most 3 results

### Requirement: API key resolved from config then env var
The tool SHALL use `config.search.apiKey` if set. If not set, it SHALL check the provider-specific env var (`BRAVE_API_KEY`, `TAVILY_API_KEY`, `SERPER_API_KEY`, `EXA_API_KEY`). If neither is set for an API-key provider, the tool SHALL return an empty array and log a warning.

#### Scenario: Config API key used
- **WHEN** `config.search.apiKey = "mykey"` and env var not set
- **THEN** backend called with `"mykey"`

#### Scenario: Env var fallback used
- **WHEN** `config.search.apiKey` unset and `BRAVE_API_KEY = "envkey"` set
- **THEN** backend called with `"envkey"` when provider is `"brave"`

#### Scenario: No key available — empty result with warning
- **WHEN** neither `config.search.apiKey` nor the env var is set for Brave
- **THEN** `web_search` returns empty array and logs "No API key configured for brave search"
