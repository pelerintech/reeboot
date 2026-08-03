# Brief — test-suite-stabilization

## Why

The reeboot unit suite is red in the agent's working environment: **30 test files / 144 tests / 920 errors** (`npx vitest run` baseline, 2026-08-03). The suite is red not because the product is broken, but because tests scatter across several coupling modes that cannot hold in this sandbox **or** in any CI-like restricted environment:

- ~13 HTTP/WS server suites bind a real loopback socket (`server.listen`) — impossible here.
- Tests write to literal `/tmp` or to the real `~/.reeboot` home — both blocked here.
- Some assert on **code/file/folder existence and naming** rather than behavior — useless and brittle.
- Some exercise the capabilities of **external libraries / third-party services** wholesale — they don't test *our* code.
- Some shell out to `npm pack`, spawn MCP child processes, need WhatsApp/knowledge-watcher subprocesses, or depend on real wall-clock timing.
- A few carry **genuinely stale assertions** (e.g. `getReeFactories` expected 7, loader returns 8).

During hermes-feature-eval (2026-08-02) we repeatedly could not be *certain* the implementation was correct because unrelated suites were red. This request is the flagged follow-up: a dedicated, deep-dive stabilization of the test suite to reach and hold an **all-green, trustworthy** state.

## What Changes

After this request, `npx vitest run` inside `reeboot/` passes **everywhere it is run** — on this machine, in CI — with **zero skips, zero gated exclusions, zero `it.skip`**. The suite verifies behavior and implementation through **public interfaces**, mocks adjacent/external services at the system boundary, uses no real sockets, no real home-dir writes, no literal `/tmp`, no shelling to tooling, and no wall-clock dependence. Test conventions are documented in `reeboot/AGENTS.md` so future tests follow the same architecture and assumptions.

Concretely this changes tests and enabling seams:

- **Tests** — fixed, reworked, or removed (see Design: disposition table).
- **Production seam (behavior-neutral)** — `server.ts` splits app construction (`buildApp`) from socket binding (`listen`), so every route is drivable via `app.request()` with no socket; WebSocket handlers are drivable at both ends without a real TCP/browser socket.
- **Docs** — `reeboot/AGENTS.md` gains a "how to write & organize tests" section.

## Goals

1. **All-green always.** `npx vitest run` passes fully in-sandbox and in CI, with no skips/exclusions.
2. **Tests prove behavior, not artifacts.** Assertions target what the system does (and its ordering/effects), through public interfaces — not the existence/naming/placement of code or files.
3. **Isolated by mocking.** Adjacent/external services (MCP, WhatsApp, knowledge-watcher/embedder, scheduler clock, DB/logger home) are faked or injected at boundaries; no suite depends on a live external service or a real child process to pass.
4. **Environment-agnostic.** Tests use no real sockets, no literal `/tmp`, no writes to the real `~/.reeboot`, no shelling to `npm`/`docker`, and no real timing.
5. **Guarded against regression.** The conventions that produce green, trustworthy tests are written into `AGENTS.md` so future tests cannot silently reintroduce fragile patterns.
6. **Confidence restored.** A change that breaks behavior turns a focused test red; unrelated suites stay green. The developer can trust the suite as a correctness signal.

## Non-Goals

- **No new product features or behavior changes.** The only production-code change is the behavior-neutral `buildApp`/`listen` seam (and any injectable seams required to fake DB/logger home and adjacent services). No runtime behavior is altered.
- **No coverage-threshold gating added** (not adding a coverage gate; that is a separate concern).
- **Not converting to a different test framework.** Vitest stays.
- **No restructuring of the codebase** beyond the minimal seams above.
- **Not changing test count down by default:** removal is only for tests that add no behavioral value (existence/naming/placement, external-capability), and only where a behavioral equivalent is not warranted. Never a net loss of behavioral coverage without justification.

## Impact

- **All test authors** (agents and humans) now operate under documented conventions.
- **The agent's working loop** becomes trustworthy: after any change, `npm run test:run` is a reliable correctness signal.
- **CI/restricted environments** can run the suite and get the same green result as a normal machine.
- **Files touched:** `reeboot/src/server.ts` (+ possibly logger/DB/test seams), ~30 test files (fix/rework/remove), `reeboot/AGENTS.md`, `reeboot/vitest.config.ts` (only if a convention demands it, e.g. no environment change otherwise).
- **Downstream**: the future request evaluating the testing strategy (split fast/slow) is superseded — this request makes the suite green and trustworthy without requiring a tier split.
