## Evaluation — 2026-07-07 12:05

### extension-subset
verdict:  ⚠️ PARTIAL
reason:   Spec S1 requires the four extension files be byte-identical to their sdk-pluggability state — `git diff` against HEAD shows no changes (satisfied). But spec S2/S3/S4/S5 each require the extension to actually *run* on a `ReeExtensionAdapter` driven by a live agent turn (e.g. S2: "when `after_provider_response` is emitted … a row exists in `rate_limits`"; S5: capabilities "injects a capabilities block"). The runner's `prompt()` is a stub that emits only `before_agent_start`/`agent_end`/`turn_end` (see `ree-runner.ts` lines 60–100) and never emits `after_provider_response`, so the S2/S4 scenarios that depend on that event cannot have been exercised against a real turn.
focus:    `reeboot/src/agent-runner/ree-runner.ts` prompt() stub — never emits `after_provider_response`; `reeboot/tests/runtime/extension-subset.test.ts` should assert DB rows on a real turn, not just init.

### ree-adapter
verdict:  ✅ SATISFIED
reason:   Spec S1–S7 (implements ExtensionAPI, registerTool, real unsubscribe, targeted removal, disposed-chat throws, chat-local session name, context reference) are all covered by `reeboot/src/extensions/ree-adapter.ts` and `reeboot/tests/runtime/ree-adapter.test.ts` (17 tests pass). The "real unsubscribe" requirement that distinguishes ree from pi is present.

### ree-chat
verdict:  ⚠️ PARTIAL
reason:   `ree-chat.ts` (292 lines) and `ree-chat.test.ts` (14 passing tests) cover S1 (isolated tool registries), S2 (FIFO bounded history), S3 (per-chat AbortController), S5 (dispose emits session_shutdown + removes listeners), S6 (reset clears history). However S4 requires each event type emitted with correct reeboot-defined fields — in particular `after_provider_response` with `contextId`/`provider`. The runner never emits `after_provider_response` (stub), so the field-shape requirement for that event type is unverified against a real provider response; the chat may declare the emit method but no path exercises it with provider data.
focus:    `reeboot/src/agent-runner/ree-runner.ts` — `after_provider_response` is never emitted; verify `ree-chat.ts` emits it with `contextId` + `provider` against a real TanStack response.

### ree-history
verdict:  ✅ SATISFIED
reason:   `ree-history.ts` + `ree-history.test.ts` (6 passing tests) cover S1 (user+assistant rows with `chat_id`), S2 (per-chat isolation), S3 (resume loads history), S5 (restart-survivable durable store). S4 (idle-evicted chat pruned) is satisfied by `sweepIdle` disposing the chat; the store path is exercised.

### ree-runner
verdict:  ❌ UNSATISFIED
reason:   This is the central capability and it is unmet. Spec "TanStack-AI-backed agent loop" S4 requires `prompt()` to consume a TanStack `chat()` async iterable and emit `before_agent_start`, `after_provider_response`, `turn_end`, `agent_end` in order with `text_delta`/`message_end` RunnerEvents. The actual `ReeAgentRunner.prompt()` (`ree-runner.ts` lines ~57–100) is an explicit stub — its own header comment states *"For v1, the agent loop is stubbed — it emits basic lifecycle events… The full TanStack-backed loop is implemented in task 14+."* It never calls `runReeAgentLoop` or TanStack `chat()`; it hardcodes an empty assistant response and a single `message_end`. S5 (tool execution + feedback loop) is a no-op placeholder test (`expect(true).toBe(true)`). S6 (3 streaming `text_delta` chunks) is unverified. S7/S8 (abort cancels in-flight prompt, per-chat) tests only assert abort "does not throw" and that two runners are constructable — they never assert the signal aborts the TanStack call or that a hanging prompt rejects with `AbortError`. Tasks 22 and 23 (real TanStack provider wiring, MCP client) are the unchecked tasks confirming this gap.
focus:    `reeboot/src/agent-runner/ree-runner.ts` `prompt()` — wire `runReeAgentLoop` from `ree-agent-loop.ts`; `reeboot/tests/runtime/ree-runner.test.ts` tasks 14–17 tests are placeholders, not real assertions.

### ree-runtime
verdict:  ✅ SATISFIED
reason:   `ree-runtime.ts` (176 lines) + `ree-runtime.test.ts` (11 passing tests) cover S1 (createChat tracks), S2 (disposeChat removes + disposes), S3 (chat isolation), S4 (shared config reference), S5 (idle eviction past TTL), S6 (maxChats cap), S7 (shutdown disposes all). The shared singleton + bounded memory requirements are met. (Note: the TanStack model client config is declared in the header but the runtime does not yet build a real model handle — that gap is attributed to ree-runner, not this capability, since S1–S7 make no provider-wiring claim.)

## Triage

✅ Safe to skip:   ree-adapter, ree-history, ree-runtime
⚠️  Worth a look:
- `ree-runner` (UNSATISFIED) — `prompt()` is a stub; the entire TanStack-backed agent loop, tool feedback, streaming, and real abort paths are unimplemented. The 6 unchecked tasks (22 real client, 23 MCP) point here. Tests for tasks 14–17 are `expect(true).toBe(true)` placeholders.
- `extension-subset` (PARTIAL) — S2/S4 scenarios depend on `after_provider_response`, which the stub runner never emits.
- `ree-chat` (PARTIAL) — S4 field-shape for `after_provider_response` is unverified against a real provider response.

❓  Human call:   none — contract is precise; the gap is implementation, not ambiguity.

---

## Evaluation — 2026-07-07 12:51

### extension-subset (Extensions run unchanged through the ReeExtensionAdapter)
verdict:  ✅ SATISFIED
reason:   `getReeFactories(config)` in `reeboot/src/extensions/loader.ts:291` returns 4 factories (observability, session-name, token-meter, capabilities) with no `DefaultResourceLoader`; the four extension files (`observability.ts`, `session-name.ts`, `token-meter.ts`, `capabilities.ts`) were last modified by `ae693c2 feat: extensions api` / earlier commits — untouched by the ree-sdk work. `tests/runtime/extension-subset.test.ts` (10 tests) exercises S2–S6 and all pass.
focus:    — (note: spec S1's `git diff <sdk-pluggability-commit>` assertion is not encoded as a test, but the file state is consistent with the requirement)

### ree-adapter (Create ReeExtensionAdapter)
verdict:  ✅ SATISFIED
reason:   `reeboot/src/extensions/ree-adapter.ts` defines `ReeExtensionAdapter implements ExtensionAPI` with constructor `(chat, context)`; `on()` returns a real unsubscribe that removes only the targeted handler (verified by S3/S4 tests); `on()` on a disposed chat throws; `setSessionName`/`getSessionName` operate on chat-local state; `context` returns the provided instance. `tests/runtime/ree-adapter.test.ts` (17 tests) all pass.
focus:    —

### ree-chat (Isolated per-chat state + reeboot-shaped events)
verdict:  ✅ SATISFIED
reason:   `reeboot/src/runtime/ree-chat.ts` holds bounded `history` (FIFO via `_maxHistory`), per-chat `tools`/`commands`/`emitter`/`abortController`/`disposed`; emits `before_agent_start`, `turn_end`, `session_shutdown`, `tool_call`, `tool_result`, `after_provider_response`, `agent_end` with the reeboot-defined fields; `dispose()` emits `session_shutdown('quit')` + `removeAllListeners()`; `reset()` emits `session_shutdown('new')` + clears history. `tests/runtime/ree-chat.test.ts` (14 tests) all pass.
focus:    —

### ree-history (Per-chat conversation-history persistence)
verdict:  ⚠️ PARTIAL
reason:   `reeboot/src/runtime/ree-history.ts` defines a durable `chats`/`chat_messages` store with `persistTurn`/`loadHistory`/`pruneHistory`/`upsertChat`/`markChatDisposed`, and `tests/runtime/ree-history.test.ts` (6 tests) exercises each function in isolation — all pass. BUT these functions are NOT called from `ree-runtime.ts`, `ree-runner.ts`, `ree-chat.ts`, or `ree-agent-loop.ts` (grep for `persistTurn|loadHistory|pruneHistory|initReeHistory` outside `ree-history.ts` itself returns nothing in `src/`). So spec S1 ("WHEN the turn completes THEN a row exists in the chat-messages store") is not satisfied end-to-end by an actual `ReeAgentRunner.prompt()` turn; S3 ("resume loads recent history from the store") has no wiring in `createChat`; S4 ("idle-evicted chat's history is pruned") — `disposeChat`/`sweepIdle` do not call `pruneHistory`. Only S5 (durability of the store itself) and the store-level mechanics are proven.
focus:    `reeboot/src/runtime/ree-runtime.ts` (createChat/disposeChat/sweepIdle must wire `loadHistory`/`pruneHistory`/`upsertChat`) and `reeboot/src/runtime/ree-agent-loop.ts` / `ree-runner.ts` (must call `persistTurn` after a turn) — the store exists but is disconnected from the runtime.

### ree-runner (AgentRunner + TanStack loop + Cancellation + Lifecycle)
verdict:  ✅ SATISFIED
reason:   `reeboot/src/agent-runner/ree-runner.ts` implements `prompt`/`abort`/`dispose`/`reset`; `createRunner` in `index.ts:19` branches on `config.sdk` and `config.agent.runner` returning a `ReeAgentRunner` for `'ree'`. `ree-agent-loop.ts` consumes the TanStack `chat()` async iterable and emits `before_agent_start`/`after_provider_response`/`turn_end`/`agent_end` + `tool_call`/`tool_result`, threads the chat `AbortSignal` into tool execution, and supports per-chat `abort()`. `tests/runtime/ree-runner.test.ts` (29 tests) covers S1–S10 and all pass.
focus:    —

### ree-runtime (Multi-chat host with bounded memory)
verdict:  ✅ SATISFIED
reason:   `reeboot/src/runtime/ree-runtime.ts` implements `createChat`/`getChat`/`disposeChat`/`sweepIdle`/`shutdown`, exposes `chatCount`, enforces `_maxChats` (evicts oldest idle on overflow), shares one config reference across chats, and `sweepIdle` disposes chats past `idleTtlMs`. `tests/runtime/ree-runtime.test.ts` (11 tests) covers S1–S7 and all pass.
focus:    —

## Triage

✅ Safe to skip:   extension-subset, ree-adapter, ree-chat, ree-runner, ree-runtime
⚠️  Worth a look:  ree-history — persistence store module + isolated tests exist and pass, but the store is NOT wired into `ReeRuntime`/`ReeAgentRunner`/`ree-agent-loop.ts`; an actual `prompt()` turn writes nothing to `chat_messages`, resume loads nothing, and idle eviction does not prune. Contract scenarios S1/S3/S4 are unsatisfied end-to-end.
❓  Human call:    (none — contract is precise on all capabilities)

---

## Evaluation — 2026-07-07 16:21

### Extension subset runs unchanged on adapter #2
verdict:  ⚠️ PARTIAL
reason:   Spec S1 (git diff vs sdk-pluggability commit empty for the four extension files) is satisfied — `git diff ae693c2 -- src/extensions/{observability,session-name,token-meter,capabilities}.ts` produces no output. S2–S6 pass in `tests/runtime/extension-subset.test.ts` (10 tests). However the brief goal states the subset must be "running unchanged on the second adapter" in the live system, and spec S6 requires "each factory … calls the extension's init function." In production, `createRunner` (`reeboot/src/agent-runner/index.ts`) never calls `getReeFactories(config)` nor `runtime.setFactories(...)` — `setFactories` is defined but has zero call sites in `src/`, and `getReeFactories` is only imported in tests. `ReeAgentRunner.prompt()` never initializes extensions on the chat's adapter, so the four extensions do not actually run in the production path.
focus:    `reeboot/src/agent-runner/index.ts` — wire `getReeFactories(config)` into the runtime and invoke factories against each new chat's adapter; `ree-runner.ts` `prompt()` never touches `runtime.factories`.

### ReeExtensionAdapter
verdict:  ✅ SATISFIED
reason:   `reeboot/src/extensions/ree-adapter.ts` implements `ExtensionAPI` with `registerTool`/`on`/`getAllTools`/`getActiveTools`/`registerCommand`; `on()` returns a real unsubscribe that removes the specific wrapped handler via `emitter.off` and the `_handlers` registry (S3/S4). Disposed-chat guards throw (S5). `setSessionName`/`getSessionName` operate on `chat.sessionName` (S6). `context` is the reference passed in (S7). All 17 tests in `tests/runtime/ree-adapter.test.ts` pass.

### ReeChat — isolated per-chat state + reeboot-shaped events
verdict:  ✅ SATISFIED
reason:   `reeboot/src/runtime/ree-chat.ts` holds per-chat `tools` Map, bounded `history` with FIFO eviction in `appendMessage`, per-chat `AbortController`, and typed `emit*` helpers producing reeboot-defined shapes (S1–S4). `dispose()` emits `session_shutdown` ('quit') and `removeAllListeners()` (S5); `reset()` emits `session_shutdown` ('new') and clears history (S6). All 14 tests in `tests/runtime/ree-chat.test.ts` pass, including field-shape assertions for every event type.

### ReeHistory — per-chat persistence
verdict:  ✅ SATISFIED
reason:   `reeboot/src/runtime/ree-history.ts` creates `chats` + `chat_messages` tables, `persistTurn` writes user+assistant rows keyed by `chat_id` (S1), `loadHistory` is per-chat (S2), `_loadHistoryIntoChat` hydrates on resume (S3), `pruneHistory` is called on idle eviction (S4), and the durability test reopens the DB file (S5). 6 + 4 integration tests pass (`ree-history.test.ts`, `ree-history-integration.test.ts`).

### ReeAgentRunner — AgentRunner + TanStack loop + cancellation + lifecycle
verdict:  ✅ SATISFIED
reason:   `reeboot/src/agent-runner/ree-runner.ts` implements `prompt`/`abort`/`dispose`/`reset` (S1); `createRunner` branches on `config.sdk==='ree'` and `config.agent.runner==='ree'` (`index.ts`, S2/S3). `runReeAgentLoop` consumes the TanStack `chat()` async iterable, emits the full event sequence and `text_delta`/`message_end` RunnerEvents (S4/S6), executes tools with the chat's `AbortSignal` and feeds results back (S5). `abort()` triggers the per-chat `AbortController` and rejects with `AbortError`; two runners sharing a runtime keep independent signals (S7/S8). `dispose()` emits shutdown and blocks further prompts; `reset()` clears history and keeps the chat reusable (S9/S10). 29 tests pass in `tests/runtime/ree-runner.test.ts`.

### ReeRuntime — multi-chat host with bounded memory
verdict:  ✅ SATISFIED
reason:   `reeboot/src/runtime/ree-runtime.ts` implements `createChat`/`getChat`/`disposeChat`/`chatCount` (S1/S2), chat isolation via per-chat emitters (S3), shared `config` reference across chats (S4), `sweepIdle()` disposing chats past `idleTtlMs` (S5), `maxChats` cap evicting the oldest idle chat (S6), and `shutdown()` disposing all chats (S7). All 11 tests in `tests/runtime/ree-runtime.test.ts` pass.

## Triage

✅ Safe to skip:   ReeExtensionAdapter, ReeChat, ReeHistory, ReeAgentRunner, ReeRuntime
⚠️  Worth a look:  Extension-subset (PARTIAL) — factories exist and pass tests, but `createRunner`/`prompt()` never wire `getReeFactories` into the runtime or initialize extensions on chats; the four extensions do not run in the production path despite the brief requiring them to "run unchanged on the second adapter."
❓  Human call:    none

---
