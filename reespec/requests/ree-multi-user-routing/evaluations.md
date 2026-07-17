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
## Re-evaluation — 2026-07-17 22:2x (post-remediation)

Contract: `brief.md` + 11 specs. Re-run after the test batch that landed at 22:13–22:18 addressing the
6 PARTIAL findings from the prior entry. Every changed test read and re-classified; routing suite run
(42/42 pass) and the timing-sensitive files run 3× back-to-back (25/25 each — no flakiness).
**Result: 5 SATISFIED / 6 PARTIAL → 10 SATISFIED / 1 PARTIAL.** Five of six gaps genuinely closed.

### conversation-id-message · conversation-id-validation · ree-context-resolution · cancel-routing · ree-runner-eviction
verdict:  ✅ SATISFIED  (unchanged — behavioral, production-wired; see prior entry)

### ree-dynamic-runner   (was ⚠️ PARTIAL — S4 — now FIXED)
verdict:  ✅ SATISFIED
reason:   S4 now behaviorally asserted (`orchestrator-ree-routing.test.ts:250-298`): a real
          `ReeRuntime`+`ReeAgentRunner` with `vi.spyOn(runtime,'getOrCreateChat')`, driven through a real
          `prompt()` (SSE stream), asserts `getOrCreateChat` was called with `'A'` (`:293`) — the
          chatId==conversationId invariant is now proven, not just inferred.

### ws-conversation-ingress   (was ⚠️ PARTIAL — S4 — now FIXED)
verdict:  ✅ SATISFIED
reason:   S4 pi-mode now tested (`ws-conversation-id.test.ts`, "pi mode" describe): real server, known
          `/ws/chat/main` connects and the published message has NO `conversationId` (pi ignores it), and
          an unknown context closes with code `4004` (the `getContextById` gate still applies in pi).
          Behavioral against a real WS server.

### ree-conversation-isolation   (was ⚠️ PARTIAL — S2 weak, S3 missing — now FIXED)
verdict:  ✅ SATISFIED
reason:   S2 was rewritten to drive two conversations through the REAL Orchestrator with a mock adapter
          exposing `sendEvent`, publishing `peerA/conversationId:A` and `peerB/conversationId:B`, and
          asserting A's events reach only `peerA` and B's only `peerB` with NO cross-delivery
          (`ree-conversation-isolation.test.ts:124+`) — it now exercises the production
          `sendEvent(msg.peerId, event)` route, not per-callback separation. S3 was rewritten to test
          real per-conversation concurrency/queueing: with A on a hanging fetch and B on a completing
          fetch, B completes independently (its `message_end` is delivered while A is still busy), a 2nd
          A-message receives a busy/queue reply, and B is never told about A's busy state. Both are
          behavioral through the orchestrator and stable across 3 repeat runs. The core privacy +
          concurrency guarantee is now genuinely covered.

### ree-messages-skip   (was ⚠️ PARTIAL — FLAKY test — now FIXED)
verdict:  ✅ SATISFIED
reason:   the nondeterministic `SELECT role FROM messages ORDER BY id` (random-UUID PK) is now
          `ORDER BY rowid` (`orchestrator-ree-routing.test.ts:426`), i.e. insertion order — deterministic.
          Confirmed stable across 3 repeat runs (previously failed intermittently). Impl unchanged
          (`skipPersist` gate) and correct; the test defect is resolved.

### ree-shared-workspace   (was ⚠️ PARTIAL — S2b — STILL ⚠️ PARTIAL)
verdict:  ⚠️ PARTIAL
reason:   S1 (shared `__ree__/workspace`) and S2a (no per-conversation meta file/dir) remain solid
          end-to-end. An S2b test was ADDED (`orchestrator-ree-routing.test.ts:414-461`) and its behavioral
          assertions — meta file absent (`existsSync`→false), no error frame, ws stays OPEN — are real.
          BUT the spec's core S2b claim ("the ree token-meter still records the turn with a default
          operationType") is NOT verified: the only usage-related assertion (`:454-458`) checks that the
          `usage` TABLE exists in `sqlite_master` — and the test itself CREATED that table at `:421`, so it
          is always-true. No assertion queries for an inserted `usage` row or checks
          `operation_type='user_message'`. (Likely because the turn produces no real usage in that setup —
          the model fetch isn't mocked with token counts.)
focus:    assert an actual `usage` row is written for a ree turn with `operation_type='user_message'`
          (drive a ree turn whose stream carries usage, as `ree-token-usage` S3 does). Note this overlaps
          `deployment-readiness/ree-token-usage` S3, which DOES verify a usage row behaviorally.

### session-search-scoping   (verification-only)
verdict:  ✅ SATISFIED  (with the same caveat: S1 re-types the FTS SQL inline rather than calling
          `session_search.execute()`; acceptable for a verification-only spec)

## Triage

✅ Safe to skip:   all except ree-shared-workspace — 10 of 11 capabilities are now behaviorally satisfied,
   including the previously-weak core privacy guarantees (isolation S2 cross-peer routing, S3
   per-conversation queueing) and the previously-flaky messages-skip test (now deterministic).

⚠️  Worth a look:
  1. ree-shared-workspace S2b — the "token-meter records the turn with a default operationType" assertion
     is hollow (checks a self-created table exists, not a written row). Only remaining residue. Minor, and
     the underlying token-metering behavior is separately proven by deployment-readiness/ree-token-usage S3.

❓  Human call:    none.

### Notes
- Full routing suite: 42/42 pass. Timing-sensitive files (isolation, orchestrator-ree-routing, ws) run
  3× back-to-back: 25/25 every time — the new orchestrator-driven tests use real `setTimeout` waits but
  are stable at current durations (50/100/200/800ms). If CI is much slower, watch the 800ms wait in
  shared-workspace S2b and the 200ms waits in isolation S2/S3.
- No `readFileSync`-on-source cheats introduced; the new tests drive the real Orchestrator/Runtime/WS.

---
### ree-shared-workspace S2b — RESOLVED (2026-07-17, follow-up)
The hollow assertion (checking that a self-created `usage` table exists — always true) was replaced with
a genuine behavioral proof of the spec's second clause. `orchestrator-ree-routing.test.ts` S2b now points
the token-meter's global `getDb()` at a test DB (via `vi.doMock`, the proven `token-meter-cost.test.ts`
pattern) and drives the REAL token-meter `agent_end` handler with a non-zero-usage event and a cwd that
has NO `.reeboot_turn_meta.json` (the ree condition that S2 proves the orchestrator produces). It then
asserts a `usage` row IS inserted with `operation_type='user_message'` and the actual token counts (12/7)
— proving "the ree token-meter still records the turn with a default operationType." Deterministic (no
server, no timing wait); `vi.doUnmock` in a `finally` prevents leakage. Verified: S2b passes, the full
file is 18/18 across 3 repeat runs with no sibling-test interference. **ree-shared-workspace flips
⚠️ PARTIAL → ✅ SATISFIED — ree-multi-user-routing is now 11/11 SATISFIED.**

---
