## ADDED Requirements

### Requirement: fetch_url tool always registered regardless of search provider
The extension SHALL register `fetch_url` for all users, including when `config.search.provider = "none"` or when no search config exists. This allows the agent to read any web page even without a search index.

#### Scenario: fetch_url available with provider = "none"
- **WHEN** extension loads with `config.search.provider = "none"`
- **THEN** `fetch_url` tool is available to the agent

#### Scenario: fetch_url available with no search config
- **WHEN** extension loads with no `config.search` key
- **THEN** `fetch_url` tool is available to the agent

### Requirement: fetch_url extracts readable text from HTML using Readability
The `fetch_url` tool SHALL accept `url: string`. It SHALL fetch the URL, parse the HTML with `linkedom`, extract the main article content with `@mozilla/readability`, and return the text. If Readability fails (non-article page), it SHALL fall back to stripping HTML tags and returning raw text. On HTTP error (4xx, 5xx, network failure), it SHALL return an error string describing the failure.

#### Scenario: Article URL returns readable text
- **WHEN** `fetch_url` is called with a URL whose mock response is a news article HTML
- **THEN** returns the article's main text content without navigation, ads, or sidebar text

#### Scenario: Non-article page falls back to stripped text
- **WHEN** `fetch_url` is called with a URL whose mock response is an app page (no article body)
- **THEN** returns HTML-stripped text (not empty, not raw HTML)

#### Scenario: HTTP 404 returns error string
- **WHEN** `fetch_url` is called with a URL that returns 404
- **THEN** returns string like "Error fetching URL: HTTP 404"

#### Scenario: Network failure returns error string
- **WHEN** `fetch_url` is called with a URL that causes a network timeout
- **THEN** returns string like "Error fetching URL: ECONNREFUSED" (no unhandled exception)

#### Scenario: User-Agent header sent
- **WHEN** `fetch_url` makes an HTTP request
- **THEN** request includes a `User-Agent` header (prevents most bot blocks)
