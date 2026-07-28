## Evaluation — 2026-07-16 13:27

### config-schema-capability
verdict:  ⚠️ PARTIAL
reason:   Zod ConfigSchema at reeboot/src/config.ts:281-283 declares `sdk` and `ree`
          fields with full types; all 5 spec scenarios have passing tests in
          tests/config-schema-ree.test.ts. However, the `ree.model` fallback to
          `agent.model` in createTanStackClient() at reeboot/src/runtime/ree-runtime.ts:424
          uses `(this.config as any)?.agent?.model` instead of typed access through
          the parsed Config object.
focus:    reeboot/src/runtime/ree-runtime.ts:424 — replace `(this.config as any)?.agent?.model`
          with typed access

### cancel-signal-capability
verdict:  ✅ SATISFIED
reason:   All 5 spec scenarios are implemented and tested — createIncomingMessage
          accepts `action: 'cancel'`, orchestrator calls runner.abort() on busy
          contexts (orchestrator.ts:235-237), idle contexts silently ignore
          (orchestrator.ts:243), WS handler uses action field with no __cancel__
          magic string (server.ts:677-684), and `{ type: 'cancelled' }` is sent
          to the WS client (server.ts:686). All tests in tests/cancel-signal.test.ts pass.

### entrypoint-capability
verdict:  ✅ SATISFIED
reason:   Entrypoint at reeboot/container/entrypoint.sh follows one-path design:
          config exists → `exec node dist/index.js start --no-interactive`;
          config missing → prints "Error: No config.json found" and "mount your
          config", exits 1. REEBOOT_AGENTS_MD written before start (Step 1).
          REEBOOT_HOST exported with default 0.0.0.0.

### ree-session-search-capability
verdict:  ⚠️ PARTIAL
reason:   session_search is registered via getReeFactories (loader.ts:277-282) and
          ReeExtensionAdapter.getCurrentChatId() returns the chat ID (S4 satisfied).
          PiExtensionAdapter does not expose getCurrentChatId. However, the
          session_search DB query in ree-session-search.ts uses a module-level
          `_cachedDb` singleton, and there are no integration tests verifying S2
          (per-chat scoped query returns correct results from chat_messages) and
          S3 (empty results return `[]` not error) against an actual database.
focus:    reeboot/src/extensions/ree-session-search.ts — add integration tests for
          S2 and S3; reconsider the `_cachedDb` singleton pattern

### api-route-guards-capability
verdict:  ✅ SATISFIED
reason:   All 4 scenarios implemented in reeboot/src/server.ts — `/api/contexts`
          (line 477), `/api/tasks` (line 327), `/api/contexts/:id/sessions`
          (line 511) all return `c.json([])` in ree mode via `sdk === 'ree'` check.
          Health, status, channels, budget, logs, reload have no ree-mode guards
          and work identically in both modes.

### spa-peer-id-capability
verdict:  ✅ SATISFIED
reason:   All 4 spec scenarios implemented — WS handler generates unique sessionId
          via nanoid() (server.ts:664), connected event includes contextId and
          sessionId (server.ts:670), registerPeer uses sessionId not contextId
          (server.ts:667-668), unregisterPeer removes only that peer on disconnect
          (server.ts:695). Tests in tests/ws-peer-id.test.ts confirm concurrent
          connections have different IDs and routing is isolated.

### ws-integration-tests-capability
verdict:  ✅ SATISFIED
reason:   All 4 spec scenarios have passing tests in tests/web-channel-routing.test.ts.
          WS handler publishes to bus (S1), cancel uses action field without
          __cancel__ (S2), same runner reused across messages (S3), orchestrator
          forwards RunnerEvents through sendEvent (S4). No createRunner() call
          from WS handler — confirmed server.ts uses _bus.publish() directly.

### ws-streaming-capability
verdict:  ✅ SATISFIED
reason:   wsSend is registered as no-op `async () => {}` (server.ts:666), events
          delivered via wsEvent forwarding each event exactly once through
          WebAdapter.sendEvent (web.ts:117). No duplicate events fabricated in
          orchestrator.ts where events are forwarded from runner directly without
          duplication. Tool call events carry correct toolCallId, toolName, and
          result fields. All tests pass.

## Triage

✅ Safe to skip:   cancel-signal-capability, entrypoint-capability, api-route-guards-capability, spa-peer-id-capability, ws-integration-tests-capability, ws-streaming-capability
⚠️  Worth a look:  config-schema-capability — `ree.model` fallback in createTanStackClient() uses `(this.config as any)` cast rather than typed access; ree-session-search-capability — `_cachedDb` singleton pattern and missing integration tests for S2/S3
❓  Human call:    *(none)*

---

## Evaluation — 2026-07-16 13:40 (post-fix verification)

### config-schema-capability (re-check)
verdict:  ✅ SATISFIED
reason:   Removed all unnecessary `(this.config as any)` casts in ree-runtime.ts
          (createTanStackClient line 424, _initMcpClientsSync line 364) and
          ree-runner.ts (prompt line 104). The `this.config` field has type
          `Record<string, any>` so the `as any` was redundant — access now
          goes through `this.config?.ree as ReeConfig` and `this.config?.agent?.model`
          consistently. All 102 tests pass across 11 related test files.

### ree-session-search-capability (re-check)
verdict:  ✅ SATISFIED
reason:   Three fixes applied. (1) `ree-history.ts` now creates a `chat_messages_fts`
          FTS5 virtual table with sync triggers in `runReeHistoryMigration()`. The
          previous code had no FTS5 index — the `MATCH` query in session_search would
          have thrown SQL errors at runtime. (2) `ree-session-search.ts` updated to
          query `chat_messages_fts` via a JOIN on `chat_messages` with a `chat_id`
          filter, correctly scoping results per chat. The `_cachedDb` singleton now
          uses a `_pendingDb` promise dedup pattern and does NOT cache null results.
          (3) Integration tests added for S2 (scoped per-chat query returns correct
          results — both `chat_id='abc'` and `chat_id='xyz'` queries verified with
          cross-chat exclusion) and S3 (empty query returns `[]` not error against
          a real SQLite DB). All 5 tests in ree-session-search.test.ts pass.

## Triage (updated)

✅ All capabilities satisfied — no action required.

---

## Evaluation — 2026-07-16 13:50

### config-schema
verdict:  ✅ SATISFIED
reason:   spec requires `sdk` and `ree` fields declared in Zod so they survive `loadConfig()`. `reeboot/src/config.ts` declares `sdk: z.enum(['pi','ree']).default('pi')` and a fully-typed `ReeConfigSchema` (maxChats/idleTtlMs/maxHistoryPerChat/systemPrompt/maxIterations/model/mcp). `createRunner` (`agent-runner/index.ts`) routes `sdk === 'ree'` → `ReeAgentRunner`. S5 fallback `ree.model ?? agent.model` is present in `ree-runtime.ts:createTanStackClient()` via typed `as import('../config.js').ReeConfig` access. `tests/config-schema-ree.test.ts` (11 tests) and `tests/runtime/ree-extension-wiring.test.ts` pass.

### entrypoint
verdict:  ✅ SATISFIED
reason:   spec S1–S4 all matched by `reeboot/container/entrypoint.sh`: `exec node dist/index.js start --no-interactive "$@"` when config exists (S1); prints `Error: No config.json found` and `mount your config` then `exit 1` when absent (S2); writes `REEBOOT_AGENTS_MD` to `~/.reeboot/agent/AGENTS.md` before start (S3); exports `REEBOOT_HOST` (S4). No env-var-to-config translation path remains.

### cancel-signal
verdict:  ✅ SATISFIED
reason:   `IncomingMessage.action?: 'cancel'` declared in `channels/interface.ts`; `createIncomingMessage` preserves it (S1). Orchestrator (`orchestrator.ts:195,211`) calls `runner.abort()` on busy contexts and returns without queuing (S2), silently ignores cancel on idle (S3). WS handler (`server.ts:674-686`) publishes `createIncomingMessage({..., action:'cancel'})` — no `__cancel__` magic string — and sends `{ type:'cancelled' }` (S4, S5). `tests/cancel-signal.test.ts` (5 tests) passes.

### ws-streaming
verdict:  ✅ SATISFIED
reason:   spec S1 requires `wsSend` to be a no-op. `server.ts:655` defines `const wsSend = async () => {};` and `wsEvent` does exactly one `ws.send(JSON.stringify(event))` per event (S1, S2). Orchestrator forwards each RunnerEvent once via `WebAdapter.sendEvent(peerId, event)` (`orchestrator.ts:363-365`), adding no synthetic `message_end`/`text_delta` (S2, S3). Covered by `tests/web-channel-routing.test.ts` (no-op wsSend, wsEvent forwarding, orchestrator event forwarding) — 13 tests pass.

### spa-peer-id
verdict:  ✅ SATISFIED
reason:   spec S1: `server.ts:651` generates `const sessionId = nanoid()` per `onOpen`, calls `webAdapter.registerPeer(sessionId, wsSend, wsEvent)` (not `contextId`), and sends `{ type:'connected', contextId, sessionId }`. S2/S4: `WebAdapter` keeps per-peer `_eventCallbacks` and `sendEvent` routes to exactly one peer. S3: `onClose` calls `webAdapter.unregisterPeer(sessionId)`. `tests/ws-peer-id.test.ts` (3 tests) passes.

### ree-session-search
verdict:  ⚠️ PARTIAL
reason:   S1 (`session_search` registered via `getReeFactories`, 5th factory in `loader.ts:336`), S2 (FTS5 query scoped `WHERE m.chat_id = ?` on `chat_messages`, not `messages`), S3 (empty array on no match), and the ree half of S4 (`ReeExtensionAdapter.getCurrentChatId()` returns `chatId`) are all present and tested in `tests/ree-session-search.test.ts` (5 tests pass). However, the pi half of S4 — "GIVEN a pi mode extension that calls `api.getCurrentChatId()` … THEN it returns `undefined` or `null`" — is NOT met: `PiExtensionAdapter` (`pi-adapter.ts`) defines no `getCurrentChatId` method, so a direct call `api.getCurrentChatId()` throws `TypeError`, not returns `undefined`/`null`. The test only asserts `(adapter as any).getCurrentChatId` is `undefined` (property absence), not that invoking it returns undefined.
focus:    `reeboot/src/extensions/pi-adapter.ts` — `getCurrentChatId` is absent; a direct call throws rather than returning undefined/null as S4 states.

### api-route-guards
verdict:  ✅ SATISFIED
reason:   spec S1–S3: `server.ts` guards `GET /api/contexts` (line 524), `GET /api/tasks` (line 462), and `GET /api/contexts/:id/sessions` (line 547) with `if ((opts.config as any)?.sdk === 'ree') return c.json([])`. S4: `/api/health`, `/api/status`, `/api/channels`, `/api/settings/budget`, `/api/logs/stream`, `POST /api/reload` are unguarded by sdk and run identically in both modes. Note: there is no ree-mode test exercising these guards (existing `rest-api.test.ts` runs in default pi mode), but the implementation satisfies every scenario.

### ws-integration-tests
verdict:  ✅ SATISFIED
reason:   spec S1 (WS→bus publish with `channelType:'web'`, no `createRunner` in handler), S2 (cancel via `action:'cancel'` + `{type:'cancelled'}`, no `__cancel__`), S3 (same runner reused across two messages), S4 (orchestrator forwards `text_delta`/`tool_call_start`/`tool_call_end` via `sendEvent` with correct peerId) are all covered by `tests/web-channel-routing.test.ts` (13 tests pass).

## Triage

✅ Safe to skip:   config-schema, entrypoint, cancel-signal, ws-streaming, spa-peer-id, api-route-guards, ws-integration-tests
⚠️  Worth a look:  ree-session-search — pi-mode half of S4: `PiExtensionAdapter.getCurrentChatId` is absent, so a literal `api.getCurrentChatId()` call throws TypeError rather than returning undefined/null; either add a no-op `getCurrentChatId(): undefined` to `pi-adapter.ts` or amend the spec to require optional-chaining access (`api.getCurrentChatId?.()`).
❓  Human call:    (none)

---
