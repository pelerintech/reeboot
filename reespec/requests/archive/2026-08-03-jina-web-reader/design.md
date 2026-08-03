# Design — Jina Web Reader sidekick

## Context

Reeboot already demonstrates the exact pattern we need in `web-search.ts`:

- `config.search.provider` selects a backend; when `searxng` is chosen, the extension
  **health-checks the sidekick on load** (`checkSearXNGHealth`) and, if unreachable,
  falls back to zero-config DuckDuckGo. The agent is never left with a dead tool.
- Tools are registered conditionally based on resolved config, not unconditionally.
- Security helpers (`isUrlSafe` SSRF guard, `isDomainBlocked` website blocklist) live
  in `security/` and are reusable.
- The agent is taught behaviour two ways: per-tool `description`/`promptSnippet`, and a
  `before_agent_start` hook returning `{ systemPrompt }` (used by `hot-memory`,
  `mcp-manager`, `budget-manager`, `skill-manager`).

Jina Reader OSS (`ghcr.io/jina-ai/reader:oss`, Apache-2.0):
- Self-hosted Docker, stateless by default, HTTP/1.1 on port `8081` (map to e.g. `3000`).
- Ways to read a page: `curl <host>/<url>` (two-tier: curl fast-path or headless Chrome,
  auto-chosen), PDFs via PDF.js, Office via LibreOffice, images via VLM captioning.
- Control headers: `x-engine`, `x-respond-with`, `x-target-selector`, `x-max-tokens`,
  `x-with-generated-alt`, `x-retain-images`, `x-retain-links`, presets (`x-preset`).
- Search-with-content variant `s.jina.ai` returns the top-N results AND their fetched
  full content.

## Approach

### Config

Add a `web` config block to `config.ts`:

```ts
const WebConfigSchema = z.object({
  jina_base_url: z.string().default(''),   // e.g. 'http://localhost:3000'
  enabled: z.boolean().default(true),       // master switch for the extension
  default_engine: z.enum(['auto','curl','browser']).default('auto'),
});
```

Semantics mirror `search`:
- `jina_base_url === ''` → no sidekick configured → extension registers nothing new,
  existing `fetch_url`/`web_search` remain. This is the self-contained baseline.
- `jina_base_url` set → extension health-checks it on load; if it responds, tools are
  registered; if not, it logs and registers nothing (never registers dead tools).

### Extension: `src/extensions/jina-reader.ts`

Same shape as `web-search.ts` default export:
`export default async function jinaReaderExtension(pi, config)`.

1. **Health check** — `checkJinaHealth(baseUrl)`:
   `GET {baseUrl}/robots.txt` (or a cheap URL) with a short timeout; returns boolean.
   Called once at load, like `checkSearXNGHealth`.

2. **Tools** (registered only when sidekick healthy):
   - `jina_read({ url, engine?, target_selector?, max_tokens?, with_generated_alt? })`
     → `GET {baseUrl}/{url}` with mapped headers; returns the clean Markdown/content
     text. Applies the website blocklist `isDomainBlocked` to `url` hostname first;
     if blocked, returns a block error without calling the container.
   - `jina_search({ query, sites?, limit? })` → search-with-content; returns the top
     results with their fetched content. Registration is **probe-gated**: a load-time
     `GET {base}/search` probe decides whether the sidekick provides the route. If the
     probe fails (as on the current OSS image, which returns a 400), `jina_search` is
     NOT registered at all — the agent is never handed a tool that can't return results
     and keeps using the working `web_search`. The `jinaSearch()` backing implementation
     is retained for future builds that add the route.

3. **Tool descriptions / promptSnippets** — per-tool guidance (mirrors `fetch_url`/
   `web_search` style), telling the model what each tool is best for.

4. **`before_agent_start` guidance** — a system-prompt block injected every turn when
   the sidekick is healthy, teaching the decision rules:
   - Have a specific URL → prefer `jina_read` (handles JS/PDF/Office/images) over
     `fetch_url`.
   - Need to gather info from many pages / a search → `jina_search` (returns full
     content) over `web_search` (snippets only) when depth is desired — included only
     when the search route probe succeeded (never steer the agent toward a tool that
     isn't registered).
   - Fall back to `web_search`/`fetch_url` for the cheap baseline or when Jina throws.
   This mirrors how `hot-memory`/`mcp-manager` inject guidance.

5. **Loader wiring** — add `jinaReaderEnabled = (core as any).jina_reader ?? true` and a
   `withAdapter` factory block calling `mod.default(api, config)`, following the
   `web-search` block exactly.

### Security posture

The container is a **local trusted fetcher** bound to localhost. Reeboot still owns the
policy decision of *which URLs may be delegated*:
- Apply `isDomainBlocked(url)` to the target hostname before calling the container
  (cheap, no DNS). Blocked → refuse.
- The SSRF guard (`isUrlSafe`) checks the destination IP of a *direct* fetch; for the
  local sidekick the target is delegated to a local process, so the relevant defence is
  the blocklist + the localhost binding of the container. We do NOT route arbitrary
  internet fetches through it without policy.
- The container exposes HTTP/1.1 on localhost only by default; operator config governs
  exposure.

## Key decisions / tradeoffs

- **Graceful degradation over hard dependency** — matches the SearXNG→DDG philosophy;
  the agent never loses functionality it already has.
- **Self-host sidekick over hosted API** — keeps reeboot self-contained; no external
  dependency; matches the "bake in more power, not more external services" decision.
- **`jina_read` is the must-have; `jina_search` is probe-gated** — the OSS image's
  search route is smoke-tested at load; if unavailable (as on the current OSS image),
  `jina_search` is not registered rather than being surfaced as a dead tool. This bounds
  risk on the OSS image's feature parity and keeps the agent's tool set honest.
- **New `web` config block, not overloading `search`** — orthogonal concern (page reading
  vs. search backend selection); keeps schemas clean.

## Risks

- **OSS image search-route availability** — `s.jina.ai` is well-supported hosted; the
  self-host OSS image's search path is unverified and confirmed absent on the current
  build. Mitigation: load-time probe gates `jina_search` registration (never a dead
  tool); `jina_read` is independent and confirmed working.
- **OSS vs SaaS feature parity** — the OSS branch strips the MongoDB storage layer; some
  SaaS-only endpoints (search, certain headers) may not behave identically. Mitigation:
  tests assert against the OSS container behaviour actually observed, not the hosted docs.
- **Health-check staleness** — the container may go down after load. Mitigation: the
  `before_agent_start` guidance tells the model to fall back to `web_search`/`fetch_url`
  if a Jina call throws; this is a soft fallback, not a hard re-probe.
- **Token/context bloat** — full-page reads can be large. Mitigation: `jina_read`
  exposes `max_tokens`; guidance encourages scoped reads.
- **Blocklist bypass** — must apply the blocklist before delegation, not after.
  Mitigation: unit tests assert a blocked URL never reaches the container call.
