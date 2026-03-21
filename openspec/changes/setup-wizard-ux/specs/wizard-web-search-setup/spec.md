## ADDED Requirements

### Requirement: Web search step shown after channels, always
Step 3b SHALL always appear after the channels step regardless of which channels were selected. It SHALL present 7 options: DuckDuckGo (default, recommended), Brave, Tavily, Serper, Exa, SearXNG, None.

#### Scenario: Step always shown
- **WHEN** user selected no channels (skipped)
- **THEN** web search step is still shown

#### Scenario: DuckDuckGo selected (default)
- **WHEN** user selects DuckDuckGo or presses Enter on default
- **THEN** config draft has `search.provider = "duckduckgo"`
- **THEN** no API key is prompted
- **THEN** "✓ Web search enabled via DuckDuckGo — no setup required." is shown

### Requirement: API-key providers prompt for key and store it
When Brave, Tavily, Serper, or Exa is selected, the wizard SHALL prompt for the API key. The key SHALL be stored in `config.search.apiKey`. A note SHALL show the corresponding env var (`BRAVE_API_KEY` etc.). Empty key SHALL re-prompt.

#### Scenario: Brave API key entered
- **WHEN** user selects Brave and enters `BSAabc123`
- **THEN** config draft has `search.provider = "brave"` and `search.apiKey = "BSAabc123"`

#### Scenario: Tavily API key entered
- **WHEN** user selects Tavily and enters `tvly-xyz`
- **THEN** config draft has `search.provider = "tavily"` and `search.apiKey = "tvly-xyz"`

#### Scenario: Empty API key rejected
- **WHEN** user submits empty API key for any provider
- **THEN** wizard re-prompts with validation message

### Requirement: SearXNG sub-flow reuses Docker detection, falls back to DDG
When SearXNG is selected, the wizard SHALL call `checkDockerStatus()` (same utility as Signal). If Docker is not installed or not running (and user skips), config SHALL fall back to `search.provider = "duckduckgo"` and a message SHALL explain. If Docker is running, wizard SHALL start the SearXNG container and set `search.baseUrl = "http://localhost:8888"`.

#### Scenario: SearXNG with Docker not installed
- **WHEN** SearXNG selected and Docker not installed
- **THEN** explanation shown with docker install link
- **THEN** config falls back to `search.provider = "duckduckgo"`
- **THEN** note: "Using DuckDuckGo as fallback. Run `reeboot search setup searxng` later."

#### Scenario: SearXNG with Docker running
- **WHEN** SearXNG selected and Docker running
- **THEN** container `reeboot-searxng` started on port 8888
- **THEN** config has `search.provider = "searxng"` and `search.baseUrl = "http://localhost:8888"`

#### Scenario: SearXNG container fails to start
- **WHEN** Docker is running but container fails to start (pull error, port conflict)
- **THEN** wizard logs warning and falls back to DDG
- **THEN** explicit message shown: "SearXNG failed to start — using DuckDuckGo instead."

### Requirement: None option disables web_search but keeps fetch_url
When None is selected, config SHALL have `search.provider = "none"`. The web-search extension SHALL still register `fetch_url` (URL fetching) but SHALL NOT register `web_search`. A note SHALL explain that the agent can still fetch URLs directly.

#### Scenario: None selected
- **WHEN** user selects None
- **THEN** config draft has `search.provider = "none"`
- **THEN** message shown: "Agent can still fetch URLs directly. Add search later with `reeboot search setup`."
