## Context

Reeboot uses pi's extension system: TypeScript files in `extensions/` are loaded at agent startup by `DefaultResourceLoader`. Each extension exports a default function `(pi: ExtensionAPI) => void` which registers tools, commands, and hooks. The `web-search` extension follows this exact pattern.

`fetch_url` is the higher-value tool for safety — scraping an arbitrary URL is always useful even with no search provider. `web_search` adds the ability to discover URLs, so it's only registered when the user has configured a provider.

TDD mandate: for each backend, write a failing test first (red), then implement (green). Integration tests for HTTP backends use `nock` or `msw` to mock network without real API calls.

## Goals / Non-Goals

**Goals:**
- `fetch_url`: fetch any URL, extract clean readable text, return to agent
- `web_search`: search via configured backend, return title + URL + snippet array
- 6 backends: DDG (zero-config), Brave, Tavily, Serper, Exa (API key), SearXNG (Docker)
- API key env var fallback (e.g. `BRAVE_API_KEY` if `config.search.apiKey` unset)
- SearXNG fallback: if container unreachable at startup, silently fall back to DDG
- All functionality tested with mocked HTTP (no real API calls in test suite)
- Zero new native deps — pure JS only

**Non-Goals:**
- Search result caching (too complex, not needed for v1)
- Streaming search results
- Image search
- Rate limiting / quota management (user's responsibility)
- DDG API (they don't have a public one) — HTML scraping only

## Decisions

### D1: Single file extension (~200 lines)

All backends in one file `extensions/web-search.ts`. No separate `backends/` directory. Small enough to read in one sitting, easy to patch. Exported functions are pure (no side effects beyond HTTP) so they're trivially unit-testable.

**Alternative:** separate `extensions/web-search/backends/*.ts`. Rejected — over-engineered for 6 small functions.

### D2: `fetch_url` uses Readability + linkedom

Same pattern as `pi-searxng`'s `extract.ts`. `linkedom` parses HTML into a DOM object; `@mozilla/readability` extracts the main article content. Returns markdown-ish plain text. Falls back to raw text stripping if Readability fails (e.g. non-article pages).

```typescript
async function fetchAndExtract(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  try {
    const dom = new JSDOM(html, { url });  // linkedom JSDOM-compatible
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    return article?.textContent?.trim() ?? stripTags(html);
  } catch {
    return stripTags(html);
  }
}
```

### D3: DDG HTML scraping — parse `result__a` links

DuckDuckGo's `html.duckduckgo.com/html/` page returns stable HTML with `.result__a` anchor tags and `.result__snippet` text. The redirect URLs are encoded as `uddg=` query params — decoded with `decodeURIComponent`. No JavaScript required, no captcha for reasonable usage.

**Risk:** DDG may change HTML structure. Mitigated by small scoped parser; easy to fix in a patch. DDG has kept this structure stable for years.

### D4: SearXNG fallback at startup

When SearXNG is configured, the extension sends a health-check GET to `baseUrl/search?q=test&format=json` at startup. If this fails (connection refused, timeout), it logs a warning and sets `resolvedProvider = 'duckduckgo'` for the session. No crash, no user interruption. User can fix by starting the container.

### D5: Environment variable fallback for API keys

```typescript
function resolveApiKey(config: SearchConfig): string | undefined {
  if (config.apiKey) return config.apiKey;
  const envVars: Record<string, string> = {
    brave: 'BRAVE_API_KEY', tavily: 'TAVILY_API_KEY',
    serper: 'SERPER_API_KEY', exa: 'EXA_API_KEY',
  };
  const varName = envVars[config.provider ?? ''];
  return varName ? process.env[varName] : undefined;
}
```

### D6: Test strategy

- Unit tests: each backend function tested in isolation with mocked `fetch` (using `vitest`'s `vi.stubGlobal('fetch', ...)`)
- DDG parser: snapshot test against a saved DDG HTML fixture
- SearXNG fallback: mock fetch to throw `ECONNREFUSED`, assert provider falls back to DDG
- `fetch_url`: test with mocked fetch returning HTML of a known article; assert Readability output
- Integration tests (optional, gated on `REEBOOT_REAL_SEARCH_TEST=1`): one live call per backend

## Risks / Trade-offs

- **DDG HTML changes** → parser breaks silently, agent gets empty results → Mitigation: parser returns empty array on parse failure (not crash), agent sees 0 results and says so
- **Readability fails on non-article pages** → fallback to raw text stripping → acceptable degradation
- **SearXNG unreachable after wizard setup** → falls back to DDG automatically → user may not notice SearXNG is broken → `reeboot doctor` should check SearXNG reachability
- **`linkedom` size (~150KB)** → added to bundle; acceptable vs `jsdom` (~10MB with native deps)

## Open Questions

- Should `fetch_url` follow redirects? Yes — default `fetch` follows redirects; no change needed.
- Should `web_search` result limit be configurable? Default 10, agent can pass `limit` param. Good enough.
