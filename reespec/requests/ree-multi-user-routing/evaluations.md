## Evaluation — 2026-07-17 21:3x

Contract: `brief.md` + 11 specs. Every named test run and its assertions read and classified BEHAVIORAL
vs CHEAT; impl verified in code and confirmed production-wired. Two load-bearing findings (the flaky
messages-skip test and the weak isolation S2/S3) were re-verified firsthand by the evaluator.
Suite: ~63 tests across the routing files; **all core impl is real and wired (no dead code, no
readFileSync-source cheats)** — but 6 of 11 capabilities have scenario-level test gaps, and there is one
genuinely flaky test.

### conversation-id-message
verdict:  ✅ SATISFIED
reason:   `conversationId` is a first-class `IncomingMessage` field threaded explicitly in
          `createIncomingMessage` (`interface.ts:40,82`); S1 round-trip + S2 optional/back-compat both
          behavioral. Wired into WS ingress (`server.ts:810,828`).

### conversation-id-validation
verdict:  ✅ SATISFIED
reason:   `isValidConversationId` enforces `^[A-Za-z0-9._:-]{1,128}$`, a `..` traversal guard, and 4
          reserved ids (`main`,`__system__`,`scheduler`,`__outage_probe__`); S1/S2/S3 behavioral. Not dead
          code — consumed by `orchestrator.ts:201` and `server.ts:795`.

### ree-context-resolution
verdict:  ✅ SATISFIED
reason:   `_resolveContext` ree branch returns the validated `conversationId` (S1), falls back
          peerId→default (S2), and pi mode ignores it in favour of routing rules (S3). All behavioral on
          the live dispatch path (`orchestrator.ts:200-226`).

### ree-dynamic-runner
verdict:  ⚠️ PARTIAL
reason:   S1 (first message lazily creates+stores a runner, no "No runner found"), S2 (reuse), S3 (pi
          unknown-context still errors) are behavioral and production-wired (`_resolveRunner`
          `orchestrator.ts:183-193`). But **S4 has no direct test** — nothing asserts the created runner
          drives `ReeRuntime.getOrCreateChat('A')` with `chatId === conversationId`. The impl chain is
          correct (`ree-runner.ts:50` `_chatId=context.id` → `:89` `getOrCreateChat`) and task-7
          indirectly proves `createRunner` receives `id==='A'/'B'`, but the invariant itself is unasserted.
focus:    add an assertion that a prompt on conversation 'A' calls `getOrCreateChat('A')`.

### ws-conversation-ingress
verdict:  ⚠️ PARTIAL
reason:   S1 (path segment → conversationId, distinct peerId), S2 (unknown id accepted in ree, gate
          dropped), S3 (reserved/invalid rejected before dispatch) are behavioral against a real WS server
          with a capturing bus. **S4 (pi mode `/ws/chat/main` still context-gated + routed to main) has
          NO test** — the describe block is ree-only, so the pi `getContextById` gate / 4004-close path
          (`server.ts:764-770`) is unverified here.
focus:    add a pi-mode WS test asserting the context gate still applies and routes to the `main` runner.

### ree-conversation-isolation
verdict:  ⚠️ PARTIAL   (the core privacy guarantee is only half-proven)
reason:   S1 (distinct chat instances + `chat_messages` scoped by `chat_id`, no cross-contamination) is a
          strong behavioral test (`ree-conversation-isolation.test.ts:99-121`). But **S2 is mislabeled**:
          `:124-143` prompts two separate runners with two callbacks and asserts each callback saw its own
          deltas — it proves per-*callback* separation, NOT the production per-`peerId` route
          (`orchestrator.ts:427-429` `sendEvent(msg.peerId, event)`); nothing proves A's reply cannot reach
          B's connection. And **S3 is missing**: `:145-172` is titled "independent serialization" but its
          own comment admits B is never prompted (`chatB` is `undefined`) — it tests abort-doesn't-reject-B,
          not the spec's claim that B runs while A is busy and a 2nd A-message queues behind A's in-flight
          turn. The per-conversation busy/queue impl exists (`orchestrator.ts:109-115,243-281`) but is
          untested for concurrency.
focus:    S2 — drive two connections through the real orchestrator and assert the presence adapter
          delivers A's events only to A's peerId. S3 — prompt B while A hangs and assert B completes
          without waiting, and a 2nd A-message queues.

### ree-messages-skip
verdict:  ⚠️ PARTIAL   (impl correct; contains a genuinely FLAKY test)
reason:   S1 (ree turn writes 0 `messages` rows) and S3 (pi writes user+assistant) are behavioral against
          a real Orchestrator + DB; the `skipPersist` gate (`orchestrator.ts:387-390`) is correct. S2
          (chat_messages persisted per conversation) is covered by the isolation suite (count≥2, though the
          user/assistant role split is not asserted). **BUG — flaky test:** S3
          (`orchestrator-ree-routing.test.ts:426`) does `SELECT role FROM messages ORDER BY id` where `id`
          is a `randomUUID()` PK, then asserts `['user','assistant']` — lexical ordering of random UUIDs is
          nondeterministic, so this test intermittently fails (observed failing in one run, passing in
          another). The implementation is correct; the ordering assertion is the defect.
focus:    order by an insertion-sequence column / `rowid` (or `created_at,rowid`), not the random `id`.

### ree-runner-eviction
verdict:  ✅ SATISFIED
reason:   all 3 scenarios behavioral against a real Orchestrator with real inactivity timers
          (`orchestrator-ree-routing.test.ts:448-516`): S1 asserts `_runners`/`_contextState` cleared AND
          `runner.dispose()` called; S2 re-creation on re-arrival; S3 pi `main` runner survives (reset,
          not disposed). Production-wired (`orchestrator.ts:700-718`, `_factoryCreated` tracking). The
          risky `dispose()` path is genuinely covered.

### ree-shared-workspace
verdict:  ⚠️ PARTIAL
reason:   S1 (A and B share one `__ree__/workspace`, not per-conversation dirs) and S2a (no
          `contexts/A/workspace/.reeboot_turn_meta.json`, no `contexts/A` dir) are strong end-to-end tests
          through the real `startServer` + WS path, capturing the real `ContextConfig`
          (`orchestrator-ree-routing.test.ts:288-362`); production-wired (`server.ts:221-226`,
          `orchestrator.ts:344-354`). **Gap: S2b has no test** — nothing asserts the ree token-meter still
          records the turn with a default `operationType` despite the skipped turn-meta file; only the
          file-absence half is verified.
focus:    add an assertion that a ree turn still writes a `usage`/token-meter row with the default
          operationType.

### session-search-scoping   (verification-only spec)
verdict:  ✅ SATISFIED  (with a caveat)
reason:   S2 (`getCurrentChatId` returns the bound chat id, distinct per chat, no leakage) is fully
          behavioral against real `ReeChat`/`ReeExtensionAdapter` (`ree-adapter.ts:154`). The production
          `session_search` tool is real and loader-wired (`ree-session-search.ts:67`, `loader.ts:336`)
          using `WHERE m.chat_id = ?`. Caveat: S1's isolation proof RE-TYPES the FTS SQL inline in the
          test rather than invoking the tool's `execute()`, so it regression-locks the query shape but does
          not exercise the shipped code path end-to-end. Acceptable given the spec is explicitly
          "verification only," but noted.
focus:    (optional) drive S1 through the real `session_search.execute()` rather than inline SQL.

## Triage

✅ Safe to skip:   conversation-id-message, conversation-id-validation, ree-context-resolution,
   cancel-routing, ree-runner-eviction, session-search-scoping.

⚠️  Worth a look (priority order):
  1. ree-conversation-isolation — the core privacy guarantee. S3 (per-conversation queue/busy concurrency)
     is NOT tested; S2 (cross-peer reply routing) is proven only at the callback level, not the production
     `sendEvent(peerId)` path. For a multi-customer support deployment these are the two scenarios that
     most need real coverage.
  2. ree-messages-skip — FLAKY test bug (nondeterministic `ORDER BY id` on random UUIDs). Fix before this
     suite can be a reliable gate; the impl itself is correct.
  3. ree-shared-workspace S2b — ree token-meter default operationType untested.
  4. ws-conversation-ingress S4 — pi-mode WS path untested.
  5. ree-dynamic-runner S4 — chatId==conversationId invariant not directly asserted (indirectly covered).

❓  Human call:    none — all gaps are concrete test additions/fixes, not contract ambiguities.

### Cross-cutting note
No `readFileSync`-on-source cheat tests were found in any routing file, and every audited impl symbol is
production-wired (factory `server.ts:223`, eviction/dispose `orchestrator.ts:700-718`, `skipPersist`
`:387-390`, turn-meta skip `:344-354`, session_search factory `loader.ts:336`). The gaps here are
missing/weak *scenarios* and one flaky assertion — not fabricated or dead-code implementations.

---
