# Design — test-suite-stabilization

## Context

Baseline (2026-08-03, `npx vitest run` in `reeboot/`): **30 files failed / 253 passed (283 total); 144 tests failed / 1718 passed / 2 skipped; 920 errors.** `retry: 1` in `vitest.config.ts` doubles the report noise but not the root causes.

The failures cluster into six species, each with a distinct root cause and remedy:

| Species | Root cause | Remedy |
|---|---|---|
| A. HTTP/WS server suites (~13) | `server.ts` builds every route inside `startServer()`; routes are only reachable via `server.listen()` (blocked in sandbox) | Split `buildApp(opts)` from `listen`; drive the real app via `app.request()`; WS via handler-level drivers |
| B. Literal `/tmp` writes (3) | Hardcoded `'/tmp'`; sandbox only permits `os.tmpdir()` (= `/tmp/claude`) | Use `mkdtempSync(join(tmpdir(),...))` |
| C. Real `~/.reeboot` writes (3–4) | Global logger/DB/config default to the real home regardless of injected `reebotDir` | Make home injectable; point all tests at a temp home |
| D. Stale test↔code drift (3) | `getReeFactories` expected 7, loader returns 8 | Fix assertion (derive from loader, not a hardcoded number) |
| E. External subprocess/services (5–7) | MCP child spawn, WhatsApp/baileys, chokidar fs watcher, embedder | Drive through existing fake seams / mock at boundary |
| F. Packaging (1) | `npm pack --dry-run` shells out | Rework in-process or remove (non-behavioral) |

## Approach

### 1. Enabling production seam (behavior-neutral): `buildApp`/`listen` split

`src/server.ts` currently declares `const app = new Hono()` inside `startServer()`. Refactor to:

```
export async function buildApp(opts): Promise<App>   // construct + register all routes + WS handlers
export async function startServer(opts): Promise<{port,host}>  // buildApp(opts) → createServer → injectWebSocket → listen
```

`buildApp` must be callable **without binding a socket** and without side effects that require a live server. This mirrors the existing, proven pattern in `src/webhooks.ts` (`buildWebhookApp` tested via `.request()` in `tests/webhook-triggers/`). Tests then drive the **real** app with `app.request('/api/...', ...)` — same routes, middleware, DB writes, auth, views, webhooks as production. Unlike the a2a-endpoints test (which re-implements handlers in a throwaway `new Hono()`), we import and drive the real `buildApp` so tests and implementation cannot drift. The literal `server.listen(...)` TCP-accept path is not exercised in unit tests (impossible in the sandbox); that path is covered by the existing Docker integration tests (`tests/docker-integration/`), which run on real machines.

**WebSocket:** `createNodeWebSocket({ app })`/`upgradeWebSocket` needs a live server to upgrade. The WS handlers' behavior (`onOpen`/`onConnect`/`onMessage`/`onClose`, message parsing, routing, event emission) is exercised at **both ends** with handler-level drivers — invoke the real handler callbacks directly with fixture messages and assert emitted behavior, and separately assert the client-side consumer logic. No real socket, no browser. `@hono/node-ws` binding remains for production/`listen`; it is not part of the unit contract.

### 2. Test isolation conventions (applied everywhere)

- **Temp dirs:** always `mkdtempSync(join(tmpdir(), ...))` / `os.tmpdir()`, never a hardcoded `'/tmp'` or `'/tmp/<name>'`.
- **Home isolation:** every test that touches config/logger/DB passes an injected `reebotDir`/`dbPath` temp value. Where the global logger or DB singleton currently defaults to the real `~/.reeboot`, add an explicit injection path (mirrors the existing `openDatabase(dbPath?)` and per-context-path decisions in `decisions.md`). Tests never write to the real home.
- **Time:** inject a clock / `vi.useFakeTimers()`; never rely on real wall-clock waits or poll intervals > a few ms.
- **Services:** use the existing fake seams (`FakePrompter`, `InMemoryTransport` + `setMcpClients`, `vi.mock('@whiskeysockets/baileys')`, embedder/search/ingest mocks). Mock only at system boundaries. Never spawn a real child process or connect to a real service for a unit assertion.

### 3. Removal policy (only these, and only justified)

- Assertions that verify **existence/naming/placement** of code, files, or folders (`fs.existsSync`, `expect(file).toMatch(/folder/)`, "file is named X in directory Y") with **no behavioral signal** → remove.
- Tests that assert the **capabilities of external libraries / third-party services** themselves (not our wiring of them) → remove; if our code exposes behavior *through* them, keep a mocked-boundary behavioral test.
- Tests that are **provably redundant** (same behavior asserted elsewhere) → remove.

Everything else is **fixed** (stale counts) or **reworked** (socket / `/tmp` / home / shelling / timing). Nothing is skipped or gated. Net behavioral coverage is preserved or increased.

### 4. Disposition of the 30 failing files

**Rework — HTTP server suites (drive real `buildApp` via `app.request`, injected db/reebotDir):**
`rest-api`, `task-api`, `channel-api`, `web-events-api`, `web-readback-api`, `credential-proxy`,
`whatsapp-pair-endpoint`, `server.test`, `orchestrator-ree-routing`, `resilience-integration`,
`resilience-wiring` (11 files). These currently fail on `listen` EPERM / real-home logger EPERM /
`no such table` cascade (migrations not run against a fresh injected db). Rework: `buildApp` + run
schema migrations on the injected temp db within the test setup.

**Rework — WebSocket suites (handler-level at both ends):**
`ws-chat`, `ws-conversation-id` (2 files; currently time out at 5s waiting on a socket).

**Rework — literal `/tmp` → `os.tmpdir()`:**
`wizard/provider`, `extensions/knowledge-manager`, `knowledge-lint-schedule` (3 files).

**Rework — real-home isolation (inject temp home; logger/DB injection path):**
`wizard.test`, `observability/events-retention-wired` (part of the home-isolation seam; also surfaced inside `rest-api`).

**Fix — stale assertion (derive from loader, not hardcoded):**
`runtime/extension-subset`, `runtime/ree-extension-wiring`, `runtime/ree-security-end-to-end`
(3 files; expectation `7` → actual `8`, or assert against the live loader count to prevent recurrence).

**Rework — external-service mocking (use existing seams):**
`mcp-manager` (MCP child spawn → `InMemoryTransport`/`setMcpClients`), `channels/whatsapp`
(`baileys` spy never wired → fully mock), `channels/whatsapp-resilience` (19/21 failed →
mock baileys/config injection), `knowledge/watcher` + `knowledge/watcher-unlink` (chokidar fs
events → drive handler logic / queue without real fs timing) (5 files).

**Rework — deterministic timing:**
`budget/session-spend-scope`, `budget/settings-api`, `budget/settings-live-update`
(3 files; ~40s hook timeouts → fake timers / injected clock).

**Rework or remove — packaging:**
`package.test.ts` (the `npm pack --dry-run` test → in-process `files`-whitelist check against the
real repo layout, or remove as non-behavioral; the manifest-metadata assertions are kept).

**Audit — remove existence/naming/external-capability tests:**
sweep the 30 files (and adjacent passing files only where the same anti-pattern appears and removal
is unambiguous, keeping the targeted scope tight) for `fs.existsSync`, naming/placement assertions,
and wholesale external-capability assertions; remove those without behavioral equivalents.

## Risks

- **`buildApp` refactor regresses production.** Mitigate: it is a pure structural split (same app, same routes, same listen). The existing Docker integration tests exercise the live socket path after the change; the HTTP unit rework exercises every route via `app.request`.
- **Reworked tests prove less than the original TCP path.** Accepted by decision: unit coverage moves to socket-free route/handler behavior; the TCP-accept path stays covered by Docker integration tests on real machines.
- **Large surface (30 files + seams).** Mitigate: vertical slices, one area green before the next; each RED→GREEN is independently verifiable; full-suite green is the final gate.
- **Mock seams could hide real integration bugs.** Mitigate: mocks sit only at true external boundaries (service/child/fs/time/home); all internal reeboot wiring stays real.
- **Home/log DB injection touches shared design assumptions** ("one process = one product"). It does not change runtime behavior — it only makes the default home path explicit/injectable for tests, consistent with the existing `openDatabase(dbPath?)` decision.
- **Removal reduces LOC coverage.** Accepted: removed tests carry no behavioral signal; new behavioral coverage replaces or exceeds them.

## Cross-cutting

Running the full suite in this sandbox takes ~2 min (784s under the hood parallelism). New suite conventions must keep individual suites fast and deterministic so the full run is a trustworthy gate.
