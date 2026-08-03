# Brief — Jina Web Reader sidekick

## Why

Reeboot's web capability today is two thin tools: `web_search` (snippets only) and
`fetch_url` (single-URL Readability extraction of static HTML). Both are limited:

- `fetch_url` cannot handle JS-rendered pages, PDFs, Office documents, or images —
  it's a brittle Readability strip.
- `web_search` returns titles/snippets, so the agent must make many round-trips to
  gather real page content.

Reeboot's philosophy is "self-contained with optional self-hosted power-ups": it runs
standalone with limited capabilities, and gains capability when an optional Docker
sidekick is present (the exact pattern already used for web search, where a self-hosted
SearXNG sidekick is used when available and reeboot falls back to zero-config
DuckDuckGo otherwise).

Jina AI Reader (`ghcr.io/jina-ai/reader:oss`, Apache-2.0, self-hostable) closes this gap
with a two-tier engine (lightweight curl fast-path for static pages, headless Chrome only
for JS-heavy pages) and native support for PDFs, Word/Excel/PPT, and VLM-captioned images,
plus a "search that reads" (`s.jina.ai`) variant that fetches full content of the top
results in one call. It is the lightweight, permissive, self-hostable fit the discovery
converged on — the browser/interactive tier (Steel, browser-use) was explicitly deferred.

## What Changes

- New optional `web` config block (`config.web.jina_base_url`), defaulting to unset —
  an empty/unset value means "no sidekick", a set value means "sidekick expected here".
- A new `jina-reader` extension (`src/extensions/jina-reader.ts`) that:
  - Health-checks the sidekick on load (like `checkSearXNGHealth`); if unreachable,
    it degrades to the existing tools rather than failing.
  - Registers `jina_read`, and registers `jina_search` only when a load-time probe
    confirms the sidekick provides the search route (never a tool that can't return
    results; the agent keeps the working `web_search` otherwise).
  - Injects a `before_agent_start` system-prompt block teaching the agent when to use
    `jina_read` / `jina_search` / `web_search` / `fetch_url` (mentioning `jina_search`
    only when it is actually registered).
  - Respects reeboot's existing security posture (website blocklist) before delegating
    target URLs to the local Reader container.
- Graceful behavior in all states: no sidekick → existing `fetch_url`/`web_search`
  only (unchanged today's behaviour); sidekick up → the agent gains the Jina tools and
  the guidance telling it to prefer them.

## Goals

- Give the agent real page-reading capability (web pages incl. JS, PDF, Office docs,
  captioned images) as clean LLM-ready Markdown — an upgrade from the brittle
  `fetch_url`.
- Add a "search that reads" path so a single call returns real page content, not just
  snippets.
- Keep reeboot self-contained: without the sidekick the agent still works (limited),
  exactly like the web-search SearXNG→DDG fallback.
- Teach the agent the decision rules (when to use each tool) via the established
  `before_agent_start` system-prompt mechanism.
- Respect reeboot's security posture: never send a blocklisted URL to the local container.

## Non-Goals

- **Not bundling/building browser interaction** (login, clicks, sessions) — Steel,
  browser-use, Playwright-driven browsing are explicitly out of scope for this
  request. This request is read/extract/search only.
- **Not** making Jina a hosted-API dependency. The sidekick is self-hosted Docker;
  there is no hosted `r.jina.ai` integration in scope.
- **Not** replacing `web_search`/`fetch_url` entirely — they remain the fallback
  baseline and remain registered when no sidekick is present.
- **Not** adding self-host `s.jina.ai` search *path* if it proves unfixable/unavailable
  on the OSS image — `jina_read` is the must-have; `jina_search` is only registered (and
  only steered) when its search route is actually present on the running sidekick.
- **Not** caching, embedding, or RAG indexing — those are downstream consumers, out
  of scope.

## Impact

- `src/config.ts` — new `web` config block + `WebConfig` type.
- New `src/extensions/jina-reader.ts` extension (tools + health-check + system-prompt
  guidance), gated via the loader.
- `src/extensions/loader.ts` — wire the new extension, following the existing
  `withAdapter` pattern.
- `src/extensions/web-search.ts` — adjacent and reused for security helpers (blocklist);
  likely no change needed, but the Jina reader must reuse its `isDomainBlocked` path.
- Agent behaviour: gains richer reading tools + decision guidance when sidekick is up.
- Operators: may run the `ghcr.io/jina-ai/reader:oss` container and set
  `config.web.jina_base_url` to enable the power-up.
- Documentation: README section on the Jina sidekick + config.
