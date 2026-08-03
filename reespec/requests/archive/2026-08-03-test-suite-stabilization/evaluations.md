# Evaluations — test-suite-stabilization

## Evaluation — 2026-08-03 17:30

Evaluating request: **test-suite-stabilization**

**Primary signal:** `npx vitest run` inside `reeboot/` is fully green — **283 test files / 1856 tests passed, 0 failed** (48.25s). The brief's headline goal ("all-green always ... with zero skips") is met in this environment.

### isolation-conventions
verdict:  ⚠️ PARTIAL
reason:   Spec requires "no test contains a hardcoded `'/'tmp'/<name>` literal path" — but literal paths like `/tmp/w` (tests/auth-gated-tools/loop.test.ts:22-23, auth-state.test.ts:5-6) and `/tmp/test-workspace` (tests/runtime/ree-runner.test.ts:7-23, ree-runtime, ree-chat, ree-adapter, ree-history, extension-subset) appear across 12+ files as `cwd`/`workspacePath`. These are inert config values (tooling is mocked, no real write observed), yet they violate the spec's letter. Home/log/DB isolation (injected `reebotDir`/`dbPath`, e.g. server-app-seam.test.ts beforeAll) and the scoped deterministic-time clause (the budget/scheduler/settings suites build data against `Date.now()` without wall-clock waiting) are satisfied.
focus:    12+ runtime/ree-* and auth-gated-tools test files — replace literal `/tmp/w` and `/tmp/test-workspace` with `mkdtempSync(join(tmpdir(), ...))` to match the stated convention

### server-app-seam
verdict:  ✅ SATISFIED
reason:   `src/server.ts` exposes `buildApp(opts): Promise<Hono>` (line 117) with no socket, and `startServer(opts)` (line 1267) still builds the app, creates the adaptor server, injects the WebSocket upgrade via `_injectWebSocket`, and binds `port`. `tests/server-app-seam.test.ts` drives `/api/health`, a `/api/contexts` POST persisted to a follow-up GET against an injected DB, and a real 404 — all via `app.request()` with no socket. WebSocket both-ends coverage is socket-free: `tests/ws-chat.test.ts` drives the real `wsChatHandler` (onOpen/onMessage/onClose) with a fake `ws` and fixture payloads, and client-side consumer logic is covered in `webchat/src/hooks/__tests__/useWebSocket.test.ts`.

### test-policy
verdict:  ⚠️ PARTIAL
reason:   Stale count assertion is fixed (current `getReeFactories` tests assert tool inclusion, not a hardcoded 7-vs-8 length); public-interfaces approach holds (routes/W S via `buildApp`/`app.request` and real handler fixtures); no real sockets found; zero `it.skip`/`describe.skip`/`.only`/`.todo`. BUT the "No sockets, no shelling, no real timing, no skips" clause states "no test ... waits on real wall-clock intervals" — real `await new Promise(r => setTimeout(r, N))` waits remain in tests/error-handling.test.ts (50–300ms), tests/commands.test.ts (20ms), tests/messages-persistence.test.ts (100–300ms), tests/runtime/ree-runner.test.ts (10ms), tests/runtime/ree-runtime.test.ts (60–80ms), tests/orchestrator-turn-trace.test.ts (150ms), tests/channel-trust.test.ts. Separately, tests/index.test.ts shells to a real `node` child process (`execFileSync('node', ['--import','tsx/esm', CLI,...])`), a real subprocess spawn against the "Mocked boundaries ... no real child process" clause.
focus:    tests/error-handling.test.ts, tests/messages-persistence.test.ts, tests/commands.test.ts, runtime/ree-runner & ree-runtime — replace real `setTimeout` drains with fake timers/injected async fences; reconsider tests/index.test.ts's real `node` subprocess spawn

## Triage

✅ Safe to skip:   server-app-seam

⚠️  Worth a look:
- isolation-conventions — literal `/tmp/w` & `/tmp/test-workspace` paths remain in 12+ test files; spec forbids hardcoded `/tmp/<name>` literals even if inert
- test-policy — real wall-clock `setTimeout` waits remain in ~7 files (violates "no real timing"); tests/index.test.ts spawns a real `node` child process (violates "no real child process")
- minor: `vitest.config.ts` sets `retry: 1` — not a skip/gate, but worth confirming it isn't masking flakiness against the "trustworthy correctness signal" goal

❓  Human call:   none — all three specs are determinable from the contract and outputs

---

## Evaluation — 2026-08-03 18:29

### isolation-conventions
verdict:  ✅ SATISFIED
reason:   scratch dirs are created with `mkdtempSync(join(tmpdir(), ...))` (agent-dir.test.ts, index.test.ts) and no test writes a hardcoded `'/tmp/<name>'` scratch path (the `/tmp` strings in approval-mode/redaction tests are fixture payloads inside mocks, not real writes); spec-named timing subjects (budget spend windows, settings-live-update, session-scope) run deterministically with zero wall-clock waits, and the suite passed fully in-sandbox without touching the real `~/.reeboot`.
focus:    —

### server-app-seam
verdict:  ✅ SATISFIED
reason:   `src/server.ts` exposes `buildApp(opts)` (line 117) that returns the Hono app socket-free, and `startServer` (line 1267) still creates the adaptor and binds `port` with WS injection — production surface unchanged; tests/server-app-seam.test.ts drives `/api/health`, persists `POST /api/contexts` to a follow-up `GET`, and asserts 404 via the real notFound handler, and AGENTS.md documents WS handlers driven at both ends with no TCP socket.
focus:    —

### test-policy — behavioral-over-existence
verdict:  ⚠️ PARTIAL
reason:   spec requires "that assertion/test is removed (or replaced by a behavioral equivalent)" when a test asserts only that a file/folder exists or is named/placed a certain way — but package.test.ts still asserts `existsSync(join(ROOT,'dist'))` ("dist/ is present") and whitelist entries exist in the repo layout; docker-compose-yml.test.ts, docker-config-template.test.ts, and skills.test.ts still assert artifact file content/existence with no runtime behavioral signal.
focus:    tests/package.test.ts, tests/docker-compose-yml.test.ts, tests/docker-config-template.test.ts, tests/skills.test.ts — existence/content-only assertions remain

### test-policy — mocked-boundaries
verdict:  ✅ SATISFIED
reason:   adjacent services are faked at boundaries — `mockExecSync`/`vi.fn()` in daemon/signal tests, `vi.mock('@whiskeysockets/baileys')` per AGENTS.md, InMemoryTransport for MCP, fake home/db via injected `reebotDir` — and nothing depends on a live external service or real `~/.reeboot` write.
focus:    —

### test-policy — no-sockets/shelling/timing/skips
verdict:  ⚠️ PARTIAL
reason:   zero `it.skip`/`test.skip`/`describe.skip` directives and no `.listen(`/`createServer` socket binding were found, but index.test.ts shells out to a real child process via `execFileSync('node', ['--import','tsx/esm',...])` (spec bans "real child process" and shelling to tooling), and channels/whatsapp-resilience.test.ts includes a real 2.2s wall-clock wait (`setTimeout(r, 2200)`, line 196) alongside its fake-timer use.
focus:    tests/index.test.ts (real node CLI child process), tests/channels/whatsapp-resilience.test.ts:196 (2.2s real wait)

### test-policy — public-interfaces-only
verdict:  ✅ SATISFIED
reason:   the green 283-file suite drives behavior through `app.request()` on `buildApp`, public functions (initAgentDir, redact, loaders), and public handlers rather than internal function internals, consistent with the "Public interfaces only" requirement.
focus:    —

## Triage

✅ Safe to skip:   isolation-conventions, server-app-seam, test-policy — mocked-boundaries, test-policy — public-interfaces-only
⚠️  Worth a look:  test-policy — behavioral-over-existence (artifact/existence assertions in package.test.ts, docker-compose-yml, docker-config-template, skills tests remain); test-policy — no-sockets/shelling/timing/skips (index.test.ts spawns real node child; whatsapp-resilience has a 2.2s real wait)
❓  Human call:    (none)

---
