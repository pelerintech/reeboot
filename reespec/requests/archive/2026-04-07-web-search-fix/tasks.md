# Tasks: web-search-fix

## Task list

### 1. Pass reeboot config to web-search extension in loader

- [x] **RED** — In `tests/extensions/loader.test.ts` add: spy on the web-search module's default export; call `getBundledFactories(config)` with a config that has `search.provider="duckduckgo"`; invoke the returned web-search factory; assert the default export was called with two arguments: `pi` and the config object. Run `npm run test:run` → fails (only one argument passed today).
- [x] **ACTION** — In `src/extensions/loader.ts`: update the web-search factory to pass `config` as second argument: `await (mod.default as any)(pi, config)`.
- [x] **GREEN** — Run `npm run test:run` → new test passes, all others pass.

---

### 2. Fix web-search extension to accept config as second argument

- [x] **RED** — In `tests/web-search.test.ts` add: call `webSearchExtension(mockPi, { search: { provider: "duckduckgo" } })`; assert `mockPi.registerTool` was called twice (fetch_url + web_search). Add second case: call with `{ search: { provider: "none" } }` → registerTool called once (fetch_url only). Add third case: call with no second arg → registerTool called once, no error. Run `npm run test:run` → fails (web_search never registered because pi.getConfig() returns undefined).
- [x] **ACTION** — In `extensions/web-search.ts`: change signature to `webSearchExtension(pi: ExtensionAPI, reebotConfig?: any)`; replace `const config = (pi.getConfig() as any)` with `const config = reebotConfig`.
- [x] **GREEN** — Run `npm run test:run` → all pass.

---

### 3. Add probeSearXNG utility

- [x] **RED** — In `tests/wizard/web-search.test.ts` add: mock `fetch` so port 8080 times out, port 8888 returns `{ results: [] }` JSON; assert `probeSearXNG()` returns `"http://localhost:8888"`. Add case: all ports fail → returns `null`. Add case: port 8080 returns valid JSON but no `results` key → skipped, tries next. Run `npm run test:run` → fails (function doesn't exist).
- [x] **ACTION** — Create `src/wizard/probe-searxng.ts`: export `probeSearXNG()` — tries `[8080, 8888, 4000]` in order; for each, `fetch("http://localhost:<port>/search?q=test&format=json", { signal: AbortSignal.timeout(3000) })`; parse JSON; if it has a `results` key return `"http://localhost:<port>"`; catch all errors and try next; return `null` if none match.
- [x] **GREEN** — Run `npm run test:run` → new tests pass, all others pass.

---

### 4. Update SearXNG wizard subflow to probe, prompt, and confirm URL

- [x] **RED** — In `tests/wizard/web-search.test.ts` add: mock `probeSearXNG` to return `"http://localhost:8080"`; mock prompter `input` to return `"http://localhost:8080"` (confirm); mock prompter `select` for "Use URL directly"; assert `runSearXNGSubflow()` returns `{ provider: "searxng", searxngBaseUrl: "http://localhost:8080", apiKey: "" }` without docker run. Add case: user edits to `"http://localhost:7777"` → that URL returned. Add case: `probeSearXNG` returns `null` → input pre-filled with `"http://localhost:8888"` as hint. Add case: user chooses "Start new container" → docker run called, returns port 8888. Run `npm run test:run` → fails.
- [x] **ACTION** — In `src/wizard/steps/web-search.ts` `runSearXNGSubflow()`: after docker-running check, call `probeSearXNG()`; show `input` prompt pre-filled with found URL or `"http://localhost:8080"` as hint, message `"SearXNG URL (confirm or edit):"` if found or `"SearXNG URL:"` if not; then show `select`: `["Use this URL directly", "Start new reeboot-searxng container on port 8888"]`; if "Use URL" → return with user's URL; if "Start new" → existing docker run flow returning port 8888.
- [x] **GREEN** — Run `npm run test:run` → all pass.

---

### 5. Fix config.ts searxngBaseUrl default to http://localhost:8888

- [x] **RED** — In `tests/config.test.ts` add: assert `defaultConfig.search.searxngBaseUrl === "http://localhost:8888"`. Run `npm run test:run` → fails (current default is `"http://localhost:4000"`).
- [x] **ACTION** — In `src/config.ts`: change `searxngBaseUrl: z.string().default('http://localhost:4000')` to `z.string().default('http://localhost:8888')`.
- [x] **GREEN** — Run `npm run test:run` → all pass.

---

### 6. Update CHANGELOG and bump version to 1.3.4 (or add to existing 1.3.4 entry)

- [x] **RED** — Check: `CHANGELOG.md` does not contain entries for `pi.getConfig()` fix or SearXNG auto-detection. Assertion passes — neither exists yet.
- [x] **ACTION** — Add to `CHANGELOG.md` under `[1.3.4]` (or create it if agent-isolation lands first): document the `pi.getConfig()` fix and SearXNG auto-detection. No version bump needed if this ships in the same 1.3.4 as agent-isolation.
- [x] **GREEN** — `CHANGELOG.md` contains both entries under `[1.3.4]`.
