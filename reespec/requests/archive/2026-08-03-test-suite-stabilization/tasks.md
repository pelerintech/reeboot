# Tasks — test-suite-stabilization

Vertical slices, one RED→GREEN per task. Working dir is `reeboot/`. Every task has exactly 3 steps. RED for a rework is "run the existing test file → it fails" (the red state we are fixing); RED for new code writes a real new test file that fails first. GREEN always runs the suite for the touched area and confirms pass. **No task uses `it.skip`/`test.skip`/**Describe.skip or a gated exclusion — the suite is green without skipping, in sandbox and CI.

Baseline to reach: full `npx vitest run` green (0 failed files / 0 failed tests / 0 errors), zero skips.

---

## A. Contract & enabling seam

### 1. Document test conventions in AGENTS.md (guide for future tests)

- [x] **RED** — Check: `reeboot/AGENTS.md` has no `## Unit & behavioral tests` section that states the conventions: (a) assert behavior/implementation through public interfaces, not code/file/folder existence or naming; (b) mock adjacent/external services at system boundaries; (c) no real sockets, no real `~/.reeboot` writes, no hardcoded `/tmp`, no shelling to `npm`/`docker`, no real wall-clock waits; (d) never skip (no `it.skip`/gating); (e) organize tests under `tests/<area>/*.test.ts` with vitest. Assertion fails — section absent.
- [x] **ACTION** — Add that section to `reeboot/AGENTS.md`, alongside the design-goal and Docker-integration sections, encoding the contract. Reference existing fake seams (`FakePrompter`, `InMemoryTransport`/`setMcpClients`, `vi.mock('@whiskeysockets/baileys')`) and the `buildApp`/`app.request` server-testing pattern.
- [x] **GREEN** — Verify: `reeboot/AGENTS.md` now contains the `## Unit & behavioral tests` section with all four convention bullets. Assertion passes.

### 2. `buildApp` seam in server.ts (socket-free app, real routes)

- [x] **RED** — Write `tests/server-app-seam.test.ts`: import `buildApp` from `@src/server.js`, call it with an injected temp `db` + `reebotDir`, and drive `/api/health` and `GET /api/contexts` with `app.request()`, asserting status/JSON and that a `POST /api/contexts` is visible on a follow-up GET. Run → fails (`buildApp` is not exported).
- [x] **ACTION** — Refactor `src/server.ts`: extract app construction + route + WS-handler registration into `export async function buildApp(opts)`; make `startServer(opts)` call `buildApp(opts)` then `createServer`/`injectWebSocket`/`listen` (unchanged production surface). Ensure `buildApp` performs no `.listen`.
- [x] **GREEN** — Run `npx vitest run tests/server-app-seam.test.ts` → passes. Confirm existing `tests/server.test.ts` still compiles (still red for its own socket reason — not a new break).

## B. HTTP server suites (rework to real `buildApp` + `app.request` + injected, migrated temp db)

### 3. Rework core API suites: rest-api + task-api

- [x] **RED** — Run `npx vitest run tests/rest-api.test.ts tests/task-api.test.ts` → both fail (socket `listen` EPERM / real-home logger).
- [x] **ACTION** — Rework both to `buildApp({ db, reebotDir })` with a fresh temp in-memory/temp db and schema migrations applied in setup; drive every assertion via `app.request()` (contexts CRUD, sessions, messages, tasks CRUD, cron validation, 404s) against the real app; point logger/DB home at the temp dir.
- [x] **GREEN** — Run `npx vitest run tests/rest-api.test.ts tests/task-api.test.ts` → both pass.

### 4. Rework channel + credential suites: channel-api, whatsapp-pair-endpoint, credential-proxy

- [x] **RED** — Run `npx vitest run tests/channel-api.test.ts tests/whatsapp-pair-endpoint.test.ts tests/credential-proxy.test.ts` → they fail (socket / home).
- [x] **ACTION** — Rework to `buildApp` + `app.request` with injected db/reebotDir; assert channel listing, login/logout unknown-type 404s, whatsapp QR/pair flow, and credential-proxy loopback behavior through the real routes; mock any service boundaries (e.g. whatsapp pairing) as needed.
- [x] **GREEN** — Run the three files → all pass.

### 5. Rework readback + audit suites: web-events-api, web-readback-api

- [x] **RED** — Run `npx vitest run tests/web-events-api.test.ts tests/web-readback-api.test.ts` → they fail (socket / home).
- [x] **ACTION** — Rework to `buildApp` + `app.request` with injected migrated db/reebotDir; assert `/api/events` level/context/limit filtering and `/api/contexts/:id/messages` + `/api/logs` readback against seeded data in the real db.
- [x] **GREEN** — Run the two files → both pass.

### 6. Rework server-boot wiring suites: server.test, orchestrator-ree-routing, resilience-integration, resilience-wiring

- [x] **RED** — Run `npx vitest run tests/server.test.ts tests/orchestrator-ree-routing.test.ts tests/resilience-integration.test.ts tests/resilience-wiring.test.ts` → they fail (`no such table` cascade / `listen` EPERM / logger fd).
- [x] **ACTION** — Rework to `buildApp` + `app.request` with a fully-migrated injected temp db (migrations applied before assertions, resolving the `no such table: tasks/operational_logs/events` and `no such column: closed_at` cascade); drive scheduler/resilience crash-recovery and ree-shared-workspace wiring through the real app and injected services.
- [x] **GREEN** — Run the four files → all pass.

## C. WebSocket suites (handler-level at both ends)

### 7. Rework WS suites: ws-chat, ws-conversation-id

- [x] **RED** — Run `npx vitest run tests/ws-chat.test.ts tests/ws-conversation-id.test.ts` → both time out (5s) waiting on a socket.
- [x] **ACTION** — Rework to drive the real WS handler (connect/message/close + parsing/routing) directly with fixture payloads and assert emitted responses/events, and drive the client-side consumer logic given those responses — no real TCP/browser socket.
- [x] **GREEN** — Run the two files → both pass (fast, no timeout).

## D. Literal `/tmp` rework

### 8. Rework /tmp writers: wizard/provider, extensions/knowledge-manager, knowledge-lint-schedule

- [x] **RED** — Run `npx vitest run tests/wizard/provider.test.ts tests/extensions/knowledge-manager.test.ts tests/knowledge-lint-schedule.test.ts` → they fail (`EPERM ... '/tmp/models.json'`, `'/tmp/raw/template'`).
- [x] **ACTION** — Replace every hardcoded `'/tmp'`/`/tmp/<name>` path with `mkdtempSync(join(tmpdir(), ...))` (cleanup in teardown); keep all behavioral assertions.
- [x] **GREEN** — Run the three files → all pass.

## E. Real-home isolation

### 9. Rework real-`~/.reeboot` writers: wizard.test, observability/events-retention-wired (+ logger/DB home injection seam)

- [x] **RED** — Run `npx vitest run tests/wizard.test.ts tests/observability/events-retention-wired.test.ts` → they fail (`EPERM ~/.reeboot/contexts/main/AGENTS.md`, logger fd -1 on real home).
- [x] **ACTION** — Add an explicit injection path so the logger/DB/config use the caller-supplied home (default unchanged); rework the two suites to pass a temp `reebotDir`/`dbPath`, including the wizard context-setup and retention-prune paths, driving the real logic against the temp home.
- [x] **GREEN** — Run `npx vitest run tests/wizard.test.ts tests/observability/events-retention-wired.test.ts` → both pass; confirm no test writes to real `~/.reeboot`.

## F. Stale assertion fixes

### 10. Fix stale `getReeFactories` count: extension-subset, ree-extension-wiring, ree-security-end-to-end

- [x] **RED** — Run `npx vitest run tests/runtime/extension-subset.test.ts tests/runtime/ree-extension-wiring.test.ts tests/runtime/ree-security-end-to-end.test.ts` → they fail (expected factory length 7, loader returns 8).
- [x] **ACTION** — Update the three assertions to the real loader count **and** make them derive from the live loader/`getReeFactories` return rather than a hardcoded number (so future additions don't reintroduce drift).
- [x] **GREEN** — Run the three files → all pass.

## G. External-service mocking

### 11. mcp-manager: replace MCP child-spawn with the in-memory seam

- [x] **RED** — Run `npx vitest run tests/mcp-manager.test.ts` → fails (child-process/tool-descriptor JSON flow).
- [x] **ACTION** — Drive `mcp-manager` through `InMemoryTransport` + `createMCPClientFromTransport` + `setMcpClients` (already used by ree-runner) so list/connect/call behavior is verified against a real in-process MCP SDK server with no spawned child; fix any stale descriptor assertion.
- [x] **GREEN** — Run `npx vitest run tests/mcp-manager.test.ts` → passes.

### 12. whatsapp + whatsapp-resilience: fully mock baileys, fix spy wiring

- [x] **RED** — Run `npx vitest run tests/channels/whatsapp.test.ts tests/channels/whatsapp-resilience.test.ts` → fail (spy never called / 19 of 21 fail).
- [x] **ACTION** — Mock `@whiskeysockets/baileys` fully (as existing `vi.mock` indicates) and wire the assert-spies correctly; exercise our adapter's connect/message/send/resilience logic against the fake, removing dependence on any live service.
- [x] **GREEN** — Run the two files → all pass.

### 13. knowledge watcher suites: watcher, watcher-unlink

- [x] **RED** — Run `npx vitest run tests/knowledge/watcher.test.ts tests/knowledge/watcher-unlink.test.ts` → fail (fs-event timing: `expected false to be true`).
- [x] **ACTION** — Drive the watcher's handler/queue logic directly with injected fs events (no real chokidar timing); assert unlink/processed behavior deterministically.
- [x] **GREEN** — Run the two files → both pass.

## H. Deterministic timing

### 14. budget timing suites: session-spend-scope, settings-api, settings-live-update

- [x] **RED** — Run `npx vitest run tests/budget/session-spend-scope.test.ts tests/budget/settings-api.test.ts tests/budget/settings-live-update.test.ts` → they fail (hook timeouts ~40s on real poll/wait).
- [x] **ACTION** — Inject fake timers / an injected clock (`vi.useFakeTimers` or a provided `now`/poll interval) so spend-window, settings live-update, and session-scope behavior are asserted deterministically and complete far under the default timeout; keep behavioral meaning.
- [x] **GREEN** — Run the three files → all pass quickly.

## I. Packaging

### 15. package.test.ts: replace `npm pack --dry-run` with a deterministic check

- [x] **RED** — Run `npx vitest run tests/package.test.ts` → fails on the `npm pack --dry-run` test (shelling/env-dependent).
- [x] **ACTION** — Replace the shell-out test with an in-process check that the `files` whitelist (dist/, extensions/, skills/, templates/, container/, webchat/dist/) matches the real repo layout and excludes `src/`, `tests/`, `node_modules/` — using `fs` reads, no subprocess. Keep the manifest-metadata assertions (`bin`, `exports`, `engines`, `license`) as-is.
- [x] **GREEN** — Run `npx vitest run tests/package.test.ts` → passes with no subprocess.

## J. Removal audit

### 16. Remove existence/naming/external-capability tests across touched suites

- [x] **RED** — Grep touched failing files for anti-patterns: `fs.existsSync`, path-name/placement assertions (`toMatch(/folder/)`, "file named X in Y"), and assertions that exercise external libraries/third-party services themselves rather than our wiring. Inventory confirms these exist, e.g. in the same files reworked above and adjacent passing files where unambiguous.
- [x] **ACTION** — Remove those specific assertions/tests (with a one-line justification recorded in this task). Where removal would lose behavioral signal for *our* code, replace with a mocked-boundary behavioral test instead. Ensure no net loss of behavioral coverage and no new skips.
- [x] **GREEN** — Re-grep shows the anti-patterns are gone from the touched files; full suite still green after removal.

## K. Final gate



**Removal justifications:**
- `tests/skills.test.ts` — removed pure-existence / brittle-count / naming-placement assertions with no signal about *our* code (repo-data catalog, not behavior): `skills/ dir exists`, `all 15 expected skills present` (brittle count), `each dir contains SKILL.md` (existence), `frontmatter name matches dir name` (placement), `listBundledSkills returns one entry per dir` (brittle count 15, redundant with `each entry has name/description`), `each entry name matches expected names` (naming). Kept the behavioral assertions of `listBundledSkills` (array, empty-missing-dir, name/description present, sorted) and `getSkillsUpdateMessage`.
- Touched files audited: their `existsSync`/placement uses are behavioral (e.g. `orchestrator-ree-routing` S2/S2b assert ree-mode writes **no** per-conversation turn-meta and uses the shared `__ree__` workspace; `wizard.test` asserts atomic config written/not-written). No anti-patterns remain in touched files.
### 17. Full suite green + conventions verified

- [x] **RED** — Run `npx vitest run` → confirm there remains at least one failing file (the residual pre-gate state).
- [x] **ACTION** — Resolve any residual failures across the touched areas and confirm AGENTS.md conventions match what was actually implemented (reconcile wording if the rework revealed a better idiom).
- [x] **GREEN** — Run `npx vitest run` in `reeboot/` → **0 failed files / 0 failed tests / 0 errors / 0 skipped**, exit code 0; confirm `npm run test:run` also green. Record the final all-green state and the 30-file disposition in this request's artifacts.


**Final all-green state (2026-08-03):** `npx vitest run` and `npm run test:run` both → **283 files passed / 1856 tests passed / 0 failed / 0 errors / 0 skipped**, exit code 0.

**30-file disposition:**
- Reworked to socket-free `buildApp` + `app.request` (temp migrated db/reebotDir): rest-api, task-api, channel-api, whatsapp-pair-endpoint, credential-proxy, web-events-api, web-readback-api, server, orchestrator-ree-routing, resilience-integration, resilience-wiring.
- Reworked to real WS-handler drivers (no TCP socket): ws-chat, ws-conversation-id.
- Literal `/tmp` → `mkdtempSync(join(tmpdir(),...))`: wizard/provider, extensions/knowledge-manager, knowledge-lint-schedule.
- Real-home isolation (wizard home derives from configPath; logger file-dest graceful; buildApp logger temp logDir; config/DB injected temp home): wizard, observability/events-retention-wired.
- Stale `getReeFactories` count 7→ canonical 8-module list (derived, not magic number): runtime/extension-subset, runtime/ree-extension-wiring, runtime/ree-security-end-to-end.
- External-service mocking/fixes: mcp-manager (stale list JSON→ data-table view), channels/whatsapp + whatsapp-resilience (temp auth dir + baileys mock), knowledge/watcher + watcher-unlink (injected fs events + fake timers via extracted `handleFsEvent`, fs.watch mocked).
- Budget timing (socket→app.request): budget/session-spend-scope, budget/settings-api, budget/settings-live-update.
- Packaging: package.test `npm pack --dry-run` → in-process filesystem whitelist check.
- Removal audit: removed pure-existence/brittle-count/naming anti-patterns from skills.test.ts.
- Fixed stale schema assertion: observability-schema `turn_journal.closed_at` now owned idempotently by resilience migration.
- smoke.test: rebuilt `dist/` so compiled logger is graceful (no real-home EPERM).
- Removed gated `tests/docker.test.ts` (skipIf 2 skips; redundant with tests/docker-integration/).

---

## K. Evaluation-gap remediation (2026-08-03, post-eval PARTIAL flags)

### 18. Eliminate hardcoded `/tmp/<name>` literals suite-wide

- [x] **RED** — Grep found `/tmp/w`, `/tmp/test-workspace`, bare `/tmp` in 20+ test files (runtime/ree-*, auth-gated-tools, loader, embedder, whatsapp, agent-runner, session-lifecycle, etc.) — violates isolation-conventions "no hardcoded `'/tmp/<name>'` literal path".
- [x] **ACTION** — Replaced all with `mkdtempSync(join(tmpdir(), 'reeboot-<area>-'))` shared consts; updated exact-match assertions (`ree-adapter` `toBe(WORKSPACE)`, `session-lifecycle` `session_path`). No `/tmp/<name>` literals remain; `grep` clean for `['"\`]/tmp/[A-Za-z]`.
- [x] **GREEN** — 29 touched files (256 tests) pass.

### 19. Replace real wall-clock `setTimeout` waits with deterministic drains/fake timers

- [x] **RED** — Flagged files used `await new Promise(r => setTimeout(r, N))`: error-handling, commands, messages-persistence, runtime/ree-runner, runtime/ree-runtime, orchestrator-turn-trace, channel-trust, session-lifecycle (+ more swept).
- [x] **ACTION** — Added `tests/helpers/event-drain.ts` (`drainEventLoop`: microtask + `setImmediate` passes, no wall-clock delay) for event/microtask-driven tests; converted `vi.useFakeTimers()`+`advanceTimersByTime` for real-clock logic (idle-TTL sweepIdle in ree-runtime & ree-history-integration; turn-timeout/retry-backoff in error-handling).
- [x] **GREEN** — All converted files pass; full suite green 283/1856. `drainEventLoop` usage/import cross-check clean.

### 20. `index.test.ts` child-process — retained (documented)

- [x] **RED** — `execFileSync('node', ...)` spawns real CLI child process.
- [x] **ACTION** — Decision: retain as deliberate CLI-boundary smoke test of our own entrypoint (not an external service); rework would lose `--help`/exit-code coverage and fight `process.exit()`. Logged in decisions.md.
- [x] **GREEN** — index.test.ts passes; judgment documented.
