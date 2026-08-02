## Evaluation — 2026-08-02 16:28

Evaluating request: jina-web-reader

### config
verdict:  ✅ SATISFIED
reason:   `WebConfigSchema` in `reeboot/src/config.ts` defines `jina_base_url` ('', default), `enabled` (true), and `default_engine` (z.enum(['auto','curl','browser']); default 'auto'); the block is optional/backward-compatible via `web: WebConfigSchema.default({})`. invalid engine rejects via zod; all 5 config scenarios covered by `tests/web/jina-config.test.ts` (5/5 pass).
focus:

### health-check
verdict:  ✅ SATISFIED
reason:   `checkJinaHealth(baseUrl)` in `reeboot/src/extensions/jina-reader.ts` probes `{base}/robots.txt` with `AbortSignal.timeout(3000)`; returns true on 2xx, false on reject/non-2xx, false within the bounded timeout on hang; with an empty `baseUrl` the extension returns before making any HTTP call and registers no tools. `tests/web/jina-health.test.ts` covers reachable/unreachable/hang/empty (5/5 pass).
focus:

### jina-read
verdict:  ✅ SATISFIED
reason:   `jina_read` is registered only after health-check; `jinaRead()` GETs `{base}/{encodedUrl}` and returns text; `buildReadHeaders` suppresses the engine header for 'auto', sets `x-engine` for 'browser', `x-target-selector`, and `x-max-tokens`; `isDomainBlocked` is applied before any container request (returns block error, no HTTP); read errors return a readable message rather than throwing; not registered when sidekick unhealthy. Covered by `tests/web/jina-read.test.ts`, `jina-read-tool.test.ts`, `jina-blocklist.test.ts` (pass).
focus:

### jina-search
verdict:  ✅ SATISFIED
reason:   `jina_search` is registered only when a load-time probe (`GET {base}/search?q=probe&limit=1`) confirms the route; `jinaSearch()` returns results with fetched `content` and slices to `limit`; `sites` appends `site:` scoping; blocklisted sites cause a refusal; probe non-2xx or unhealthy sidekick → tool not registered and `web_search` retained; `jinaSearch()` backing function kept for future builds. Covered by `tests/web/jina-search.test.ts` and `loader-jina.test.ts` (pass).
focus:

### agent-guidance
verdict:  ✅ SATISFIED
reason:   `before_agent_start` returns `event.systemPrompt + block` (composes, not replaces); block always tells agent to prefer `jina_read` over `fetch_url` when a specific URL is known; `jina_search` guidance (prefer over `web_search`) is appended only when `searchAvailable`; fallback to `web_search`/`fetch_url` on Jina errors is instructed; no block injected when sidekick unhealthy or `web.enabled:false`. Covered by `tests/web/jina-guidance.test.ts` (5/5 pass).
focus:

## Triage

✅ All capabilities satisfied — no action required.

---
