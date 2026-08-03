# Tasks — Jina Web Reader sidekick

## 1. Config block (RED — test file)

- [x] **RED** — Write `tests/web/jina-config.test.ts` (vitest): given no `web` block,
      parse default config and assert `config.web` equals `{ jina_base_url: '', enabled: true, default_engine: 'auto' }`;
      given `{ web: { jina_base_url: 'http://localhost:3000' } }`, assert the value is kept and `enabled === true`;
      given `{ web: { enabled: false } }`, assert `enabled === false`; given `{ web: { default_engine: 'bad' } }`,
      assert parse throws (zod enum). Run `npx vitest run tests/web/jina-config.test.ts` → fails (no `web` schema).
- [x] **ACTION** — Add `WebConfigSchema` (`jina_base_url` default `''`, `enabled` default `true`,
      `default_engine` enum `auto|curl|browser` default `'auto'`) and `web: WebConfigSchema.default({})` to the top-level
      config schema in `src/config.ts`; export `WebConfig` type.
- [x] **GREEN** — Run `npx vitest run tests/web/jina-config.test.ts` → passes. Run existing `tests/config*.test.ts` + `tests/config-schema.test.ts` → no regressions.

## 2. Health check (RED — test file)

- [x] **RED** — Write `tests/web/jina-health.test.ts`: using a mocked `global.fetch`,
      assert `checkJinaHealth(baseUrl)` returns `true` on 2xx, `false` on connection-refused/non-2xx,
      `false` on a hanging/never-resolving fetch within a bounded timeout, and that no fetch is made for an empty baseUrl.
      Run `npx vitest run tests/web/jina-health.test.ts` → fails (function doesn't exist).
- [x] **ACTION** — Export `checkJinaHealth(baseUrl: string): Promise<boolean>` in `src/extensions/jina-reader.ts`
      using a short-timeout `AbortController` fetch, returning `false` on any error/timeout/non-2xx.
- [x] **GREEN** — Run `npx vitest run tests/web/jina-health.test.ts` → passes.

## 3. jina_read tool (RED — test file)

- [x] **RED** — Write `tests/web/jina-read.test.ts`: with a mocked `global.fetch`, assert that
      `jinaRead(baseUrl, { url, engine?, target_selector?, max_tokens? })` GETs `{baseUrl}/{url}`,
      forwards `engine`/`target_selector`/`max_tokens` as the appropriate headers when provided,
      omits engine when `auto`/absent, and returns the body text on 2xx. Run
      `npx vitest run tests/web/jina-read.test.ts` → fails (function doesn't exist).
- [x] **ACTION** — Implement `jinaRead(...)` in `src/extensions/jina-reader.ts` building the request URL
      and header map (`x-engine`, `x-target-selector`, `x-max-tokens`) and returning the text.
- [x] **GREEN** — Run `npx vitest run tests/web/jina-read.test.ts` → passes.

## 4. Blocklist enforcement before delegation (RED — test file)

- [x] **RED** — Write `tests/web/jina-blocklist.test.ts`: with the website blocklist enabled and a
      blocklisted hostname, call the `jina_read` handler; assert it returns a block error AND that
      `global.fetch` was never invoked against the container. Run `npx vitest run tests/web/jina-blocklist.test.ts` → fails.
- [x] **ACTION** — In the `jina_read` tool execution path, apply `isDomainBlocked(url.hostname, blocklist)`
      before calling `jinaRead`; if blocked, return the block error without an HTTP call. Reuse `isDomainBlocked`
      from `security/website-blocklist`.
- [x] **GREEN** — Run `npx vitest run tests/web/jina-blocklist.test.ts` → passes. No container HTTP call is made for blocked URLs.

## 5. jina_read tool registration (RED — test file)

- [x] **RED** — Write `tests/web/jina-read-tool.test.ts`: given `jina_base_url` set and a mock health check
      returning healthy, assert that calling the extension factory registers a `jina_read` tool with the expected
      name and `promptSnippet`; given an unhealthy/empty sidekick, assert no `jina_read` tool is registered.
      Run `npx vitest run tests/web/jina-read-tool.test.ts` → fails (extension not implemented).
- [x] **ACTION** — Implement the default extension export `jinaReaderExtension(pi, config)` that health-checks
      and registers `jina_read` (with description + promptSnippet, parameters via Type.Object) only when healthy,
      using the existing `registerTool` API.
- [x] **GREEN** — Run `npx vitest run tests/web/jina-read-tool.test.ts` → passes.

## 6. jina_search tool + probe-gated registration (RED — test file)

- [x] **RED** — Write `tests/web/jina-search.test.ts`: with a mocked fetch, assert the `jina_search` handler
      returns results with content and respects `limit`/`sites`; assert that when the search route probe responds as
      unavailable (404/non-2xx) `jina_search` is NOT registered (never a dead tool — the agent keeps `web_search`);
      assert `sites` containing a blocklisted hostname is refused. Run
      `npx vitest run tests/web/jina-search.test.ts` → fails.
- [x] **ACTION** — Implement `jinaSearch(...)`, a load-time `GET {base}/search` probe, and `jina_search` tool
      registration in `src/extensions/jina-reader.ts` gated on the probe succeeding, with blocklist scoping on
      `sites`. The `jinaSearch()` implementation is retained for future builds that add the route.
- [x] **GREEN** — Run `npx vitest run tests/web/jina-search.test.ts` → passes.

## 7. before_agent_start guidance (RED — test file)

- [x] **RED** — Write `tests/web/jina-guidance.test.ts`: with a healthy sidekick and a working search route, invoke
      the extension's `before_agent_start` handler; assert the returned `systemPrompt` = `event.systemPrompt + <block>`
      and contains `jina_read` and `jina_search`, plus instructions to prefer `jina_read` over `fetch_url` for a known
      URL and `jina_search` over `web_search` for depth, with fallback to `web_search`/`fetch_url` on Jina errors.
      Also assert that when the search route is unavailable the prompt still contains `jina_read` guidance but does NOT
      mention `jina_search`. With an unhealthy/empty sidekick, assert the returned prompt is unchanged. Run
      `npx vitest run tests/web/jina-guidance.test.ts` → fails.
- [x] **ACTION** — Register `pi.on('before_agent_start', ...)` returning `{ systemPrompt }` only when the sidekick
      is healthy, composing the guidance block onto `event.systemPrompt`; include the `jina_search` guidance only
      when the search route probe succeeded (never steer the agent toward an unregistered tool).
- [x] **GREEN** — Run `npx vitest run tests/web/jina-guidance.test.ts` → passes.

## 8. Loader wiring (RED — test file)

- [x] **RED** — Write `tests/extensions/loader-jina.test.ts`: given `config.web.jina_base_url` unset, assert the
      jina-reader factory is not invoked; given `config.web.enabled: false` with jina_base_url set, assert it is not
      invoked; given `jina_base_url` set and `enabled: true`, assert the jina-reader factory IS invoked via the
      `withAdapter` path. Run `npx vitest run tests/extensions/loader-jina.test.ts` → fails (not wired).
- [x] **ACTION** — In `src/extensions/loader.ts`, add `jinaReaderEnabled` gating (default true) and a
      `withAdapter` factory block `importExt('jina-reader')` + `mod.default(api, config)`, mirroring the
      `web-search` block. Add `jina_reader: z.boolean().default(true)` to `ExtensionsCoreConfigSchema`.
- [x] **GREEN** — Run `npx vitest run tests/extensions/loader-jina.test.ts` → passes. Run the existing
      `tests/extensions/loader.test.ts` (or equivalent) → no regressions.

## 9. Full suite + integration (GREEN — run, no new code)

- [x] **RED** — Run the full test suite `npx vitest run`; assert any new `tests/web/*` and
      `tests/extensions/loader-jina.test.ts` files run, and record the current pass/fail baseline. (If a new test
      fails here, it must be fixed — do not proceed with failing tests to the next task.)
- [x] **ACTION** — Fix any regressions introduced by the new extension/config/loader changes.
- [x] **GREEN** — Full suite passes: `npx vitest run` exits 0 with the new Jina tests green and no regressions
      in the existing suite.

## 10. Docker smoke test (non-code — observable assertion)

- [x] **RED** — Check: with the `ghcr.io/jina-ai/reader:oss` container pulled and run
      (`docker run --rm -p 3000:8081 ghcr.io/jina-ai/reader:oss`), `curl http://localhost:3000/https://example.com`
      returns non-empty Markdown/text AND `jina_read` against a running reeboot returns content. Assertion fails
      if the OSS image does not serve reads on the HTTP/1.1 port (unverified behaviour — this is the probe).
- [x] **ACTION** — If the read route works, record the confirmed port/routes and verify the search route
      (`s.jina.ai`-equivalent on the OSS image). If search is absent on OSS, note it — this confirms the
      probe-gated behaviour: `jina_search` will not be registered on this build and the agent uses `web_search`.
- [x] **GREEN** — Re-check the assertion: reads confirmed working via the sidekick (both the raw URL and the
      URL-encoded form the tool sends), and search confirmed absent on the OSS build (400) — validating that
      `jina_search` is gated off rather than surfaced as a dead tool.

## 11. Documentation (non-code — observable assertion)

- [x] **RED** — Check: `README.md` does not contain a "Web Reader (Jina)" section, and does not document
      `config.web` / the Jina sidekick Docker command. Assertion fails — sections absent.
- [x] **ACTION** — Add a "Web Reader (Jina)" section to `README.md`: what the sidekick enables (read JS/PDF/Office/
      images as Markdown, search-that-reads), the Docker command
      (`docker run --rm -p 3000:8081 ghcr.io/jina-ai/reader:oss`), the `config.web.jina_base_url` setting, and the
      graceful fallback behaviour without the sidekick.
- [x] **GREEN** — Verify: `README.md` now contains "Web Reader (Jina)", the docker run command string, and the
      `jina_base_url` config key. Assertion passes.

## 12. Decision log (non-code — observable assertion)

- [x] **RED** — Check: `reespec/decisions.md` does not yet contain a Jina-web-reader entry describing the
      self-host-sidekick-with-fallback approach. Assertion fails — entry absent.
- [x] **ACTION** — Append a decision entry to `reespec/decisions.md` capturing: self-hosted
      `ghcr.io/jina-ai/reader:oss` sidekick (Apache-2.0, permissive) over a hosted `r.jina.ai` dependency; graceful
      degradation to `fetch_url`/`web_search` when no sidekick (mirrors SearXNG→DDG); browser/interactive tier
      (Steel, browser-use) explicitly deferred; blocklist-before-delegation security posture.
- [x] **GREEN** — Verify: `reespec/decisions.md` contains a Jina web-reader entry with the sidekick + fallback +
      deferred-browser points. Assertion passes.
