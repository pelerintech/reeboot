## Evaluation — 2026-07-17 (with test-quality audit)

Contract: `brief.md` + 13 specs. Every named test file was run (all currently pass) and its assertions
were read and classified BEHAVIORAL vs CHEAT (source-string / structural). Impl was verified in code.
Headline: the suite is green, but **9 of 13 capabilities are PARTIAL** — two have real functional gaps,
one contradicts its own spec, and three are "verified" only by regex-matching source files.

### ssrf-ip-blocklist
verdict:  ✅ SATISFIED
reason:   `isUrlSafe` (`ssrf-guard.ts:57-70,130-151`) blocks `0.0.0.0`, ULA `fc00::/7`, link-local
          `fe80::/10`, and decodes IPv4-mapped `::ffff:` back to dotted before range-checking. All 5
          scenarios BEHAVIORAL — real guard called, DNS mocked only at the boundary
          (`tests/security/ssrf-guard.test.ts`, 20/20).

### budget-session-window
verdict:  ✅ SATISFIED
reason:   `BudgetGuard` takes an injectable `sessionStartTs`; session queries filter `created_at >= ?`
          while daily keeps `start of day` (`guard.ts:22-26,121-143`). All 3 BEHAVIORAL — real
          `:memory:` db, real `usage` rows with controlled timestamps, asserts on `{ok,reason}`
          (`tests/budget/guard-session-window.test.ts`, 3/3).

### budget-warning-ordering
verdict:  ✅ SATISFIED
reason:   hard limits return immediately; `pendingWarning` is only emitted after all hard checks
          (`guard.ts:59-66,189`). All 3 BEHAVIORAL (`tests/budget/budget-guard.test.ts`) — S1 proves a
          cost breach wins over a token warning; S3 exercises `_warnedKeys` dedup.

### ree-abort-reset
verdict:  ✅ SATISFIED
reason:   `prompt()` recreates the controller when aborted (`ree-runner.ts:97-99`). All 3 BEHAVIORAL —
          real prompts via mock SSE: after reset/abort the next prompt `resolves` with no error event,
          and an in-flight abort `rejects.toThrow(/abort/i)` (`tests/runtime/ree-runner.test.ts`).

### ree-token-usage
verdict:  ⚠️ PARTIAL
reason:   impl maps `RUN_FINISHED` usage and token-meter writes a `usage` row; S1 (agent_end usage) and
          S3 (real DB row) are BEHAVIORAL. **S2 has no test** — nothing drives the loop and asserts
          `turn_end`/`message_end` carry the stream's non-zero tokens; the only turn_end test calls
          `emitTurnEnd` directly with hand-set values, so the "not hardcoded zeros" claim is unverified.
focus:    add a loop-driven test asserting `message_end`/`turn_end` reflect the stream's usage.

### ree-before-agent-start-hooks
verdict:  ⚠️ PARTIAL
reason:   `emitBeforeAgentStart` merges the return and runs before chatOptions (`ree-chat.ts:186-205`,
          `ree-agent-loop.ts:135-145`); S1/S3 BEHAVIORAL. **S2 has no test** — no test inspects the
          serialized model request to prove the injected `systemPrompt` actually reaches the model.
focus:    assert the injected text appears in the outbound model request body (a real `prompt()`).

### ree-tool-errors
verdict:  ⚠️ PARTIAL
reason:   `toTanStackTool` throws on `isError` and both events derive it (`ree-agent-loop.ts:66-70,235-272`);
          S2 BEHAVIORAL (wrapped execute rejects). **S1 asserts only the `tool_result` extension event —
          not the `tool_call_end` RunnerEvent `isError` half the spec requires** (events aren't captured).
          **S3 has no driven test** (only a direct `emitToolResult` echo), so the success regression is weak.
focus:    capture `tool_call_end` and assert `isError:true`; add a success case driven through the loop.

### ree-security-extensions
verdict:  ⚠️ PARTIAL
reason:   `getReeFactories` includes injection-guard + trust-enforcer and the handlers behave (covered in
          `tests/extensions/{trust-enforcer,injection-guard-scanning}.test.ts`). But the three C3 subset
          scenarios are weak: **S1 and S3 are structural counts** (`listenerCount>=1`; `factories.length===7`)
          that don't prove the two security factories specifically are wired (the `before_agent_start`
          count is also fed by the capabilities extension); **S2 is not a real `prompt()`** — it only
          asserts `systemPrompt` changed length, never asserts the `<external_content_policy>` text nor
          reads the model request, and passes only because injection-guard happens to be the last listener
          (order-dependent). The spec's end-to-end claim is not genuinely verified.
focus:    a real ree `prompt()` capturing the model request and asserting the policy text; assert factory
          identity, not counts.

### memory-consolidation-removal   (RESOLVED 2026-07-17: removal is intentionally ree-only)
verdict:  ✅ SATISFIED (ree scope) — spec corrected
reason:   Intent confirmed by owner: consolidation is disabled in ree (multi-user) by design and RETAINED
          in pi (single-user). The impl matches: `bootstrap.ts:32-40` gates memory jobs on `sdk !== 'ree'`,
          so ree schedules no sentinel while pi still registers it (`memory-manager.ts:561-568`;
          `tests/extensions/{memory-server-jobs,memory-consolidation-race}.test.ts` assert the pi
          registration). The spec was reworded to say "ree-only," and S3 (pi retains) added. The original
          "removed globally" wording was the error, not the code.
focus:    (spec fixed) — but see the SEPARATE defect below.

### pi-memory-consolidation-wiring   (COUNTS AGAINST deployment-readiness — discovery miss)
verdict:  ❌ BROKEN — must fix before this request is truly done
reason:   In pi mode the `__memory_consolidation__` job is scheduled but **never routed to
          `runConsolidation`**. The sentinel string appears only at its registration
          (`memory-manager.ts:562,566`); nothing intercepts it, and `runConsolidation` (`:375`) is called
          from nowhere in `src/` (only its own tests). When the job fires, the scheduler publishes the
          literal prompt `"__memory_consolidation__: Run the memory consolidation process…"` to the agent
          as an ordinary LLM turn. The designed structured pipeline (mine `messages`, update
          MEMORY.md/USER.md, log `memory_log`) is dead code in production. This is IN SCOPE: the E1
          discovery notes explicitly named "the sentinel is never intercepted, runs as a vague prompt"
          as the problem to fix; E1 fixed only the ree side and left pi broken. Owner: pi consolidation
          is a key single-user capability → fix ASAP.
focus:    resolved design (owner + existing 2026-04-23/05-22 decisions): STRUCTURED. Add an interceptor
          that maps the `__memory_consolidation__` sentinel to `runConsolidation(...)` instead of a raw
          agent turn, with a behavioral test that a fired job calls the pipeline and writes memory_log.

### knowledge-source-delete
verdict:  ⚠️ PARTIAL   (S3 unimplemented)
reason:   `deleteKnowledgeSource` (`ingest.ts:150-159`) removes chunks/FTS/source and no-ops on unknown
          path; S1/S2 BEHAVIORAL. **S3 is not implemented** — `watcher.ts:66-94` has no unlink handling
          (`statSync` throws and the handler returns early), and `deleteKnowledgeSource` is never called
          anywhere in `src/` (dead code). No test covers the watcher-on-unlink scenario.
focus:    wire unlink handling in `watcher.ts` to call `deleteKnowledgeSource`; add the integration test.

### retention-periodic
verdict:  ⚠️ PARTIAL   (impl correct; periodic behavior tested only by source-string)
reason:   `setInterval(pruneObservabilityData)` is armed (`server.ts:159-161`) and cleared in `stopServer`
          (`:782-785`) — impl is correct. But **all three scenario tests are CHEATS**: they read
          `server.ts` as text and regex-match (`/_retentionTimer\s*=\s*setInterval/`,
          `.toContain('REEBOOT_RETENTION_INTERVAL_MS')`, `/clearInterval\([^)]*_retentionTimer/`). The
          behavioral fake-timer test the spec's S2 demands (advance the interval, observe an over-age row
          pruned after boot) is absent. A regression would not be caught.
focus:    replace the source-string tests with a fake-timer test: start the server, advance the interval,
          assert an over-age row is pruned; assert no prune fires after `stopServer`.

### scheduler-inflight
verdict:  ⚠️ PARTIAL   (zero behavioral coverage)
reason:   the guard is correctly implemented (`scheduler.ts:158,174,203,313`), but the **entire test file
          only regex-matches the source** (`/_inFlight\.has\(/`, `\.add\(`, `\.delete\(`). No scenario is
          exercised: no hanging handler, no two poll cycles, no spy proving single dispatch, no
          clear-after-completion assertion. The described behavior is completely unverified.
focus:    real test — a hanging task handler + two polls asserting exactly one invocation; completion and
          `cancelJob` each clear `_inFlight`.

### resilience-abort-journal
verdict:  ⚠️ PARTIAL   (zero behavioral coverage)
reason:   impl closes the journal on AbortError and leaves it open on timeout (`orchestrator.ts:427-430,
          410-423`) — correct. But **all three tests are CHEATS** reading `orchestrator.ts` source; **S2 is
          mislabeled** (asserts the source contains `closeTurn`, never touches `getOpenJournals`). No test
          drives an orchestrator whose runner rejects `AbortError` and asserts zero `status='open'` rows.
focus:    drive the orchestrator with an AbortError runner; assert 0 open `turn_journal` rows and
          `getOpenJournals` excludes it; a timeout turn still leaves one open.

## Triage

✅ Safe to skip:   ssrf-ip-blocklist, budget-session-window, budget-warning-ordering, ree-abort-reset

⚠️  Worth a look (priority order):
  0. pi-memory-consolidation-wiring (NEW, out-of-contract) — pi consolidation never calls `runConsolidation`; sentinel runs as a literal prompt. Owner flagged pi consolidation as key → highest impact.
  1. knowledge-source-delete — S3 NOT IMPLEMENTED: watcher never calls delete on unlink; `deleteKnowledgeSource` is dead code. Functional gap.
  2. scheduler-inflight — 100% cheat tests (source regex); zero behavioral coverage.
  3. resilience-abort-journal — 100% cheat tests; S2 mislabeled; zero behavioral coverage.
  4. retention-periodic — periodic timer verified only by source-string; behavioral fake-timer test absent.
  5. ree-security-extensions — C3 subset scenarios weak: S1/S3 structural counts, S2 not a real end-to-end prompt (order-dependent).
  6. ree-tool-errors — S1 misses the `tool_call_end` half; S3 has no driven test.
  7. ree-token-usage — S2 (usage → turn_end/message_end non-zero) untested.
  8. ree-before-agent-start-hooks — S2 (injected prompt reaches the model) untested.

  (RESOLVED) memory-consolidation-removal — owner confirmed removal is ree-only; pi retains consolidation.
  Spec reworded, verdict now SATISFIED. Distinct from the pi-wiring defect (item 0).

❓  Human call:    pi-memory-consolidation-wiring — intended structured (`runConsolidation`) or agentic
                   (literal prompt)? Determines whether to add an interceptor or drop the sentinel marker.

## Test-quality findings (per the reviewer's explicit ask: real tests, not string/structure tests)

CHEAT tests (assert on source-file strings / code structure, never drive runtime behavior):
  - scheduler-inflight            — S1,S2,S3  (regex over `scheduler.ts`)
  - resilience-abort-journal      — S1,S2,S3  (regex over `orchestrator.ts`; S2 mislabeled)
  - retention-periodic            — S1,S2,S3  (regex over `server.ts`)
  - ree-security-extensions       — S1 (listenerCount), S3 (factories.length); S2 behavioral-lite but not end-to-end

Scenarios with NO test (behavior may be implemented but is unverified):
  - ree-token-usage S2, ree-before-agent-start-hooks S2, ree-tool-errors S3 (and S1 half), memory-consolidation-removal S2

Real functional gaps (not just test gaps):
  - knowledge-source-delete S3 — watcher unlink path unimplemented; `deleteKnowledgeSource` uncalled
  - memory-consolidation-removal — sentinel still scheduled in pi mode (spec says never)

BEHAVIORAL and solid: all of ssrf-ip-blocklist, budget-session-window, budget-warning-ordering,
ree-abort-reset; plus S1/S3 of ree-token-usage, ree-before-agent-start-hooks and S2 of ree-tool-errors.

---

## Re-evaluation — 2026-07-17 21:2x (post-remediation)

Contract: `brief.md` + 14 specs. Re-run after the remediation batch landed (new files
`src/llm/one-shot.ts`, `src/scheduler-dispatch.ts`, plus behavioral-test rewrites). Every named
test file was run and its assertions read and classified BEHAVIORAL vs CHEAT; impl verified in code.
**Headline: 9 previously PARTIAL/BROKEN capabilities → now 12 SATISFIED, 1 PARTIAL, 1 BROKEN.** Full
suite: 1597 passed / 4 failed / 2 skipped (1603). The 4 failures are non-contract flakes (see bottom).

### ssrf-ip-blocklist
verdict:  ✅ SATISFIED
reason:   `ssrf-guard.ts` still blocks 0.0.0.0, fc00::/7, fe80::/10, IPv4-mapped decode; all scenarios
          behavioral (real guard, DNS mocked at boundary). Re-ran green.

### budget-session-window
verdict:  ✅ SATISFIED
reason:   session queries filter `created_at >= sessionStartTs`; 3/3 behavioral (real :memory: db,
          controlled timestamps). Re-ran green.

### budget-warning-ordering
verdict:  ✅ SATISFIED
reason:   hard limits evaluated before `pendingWarning`; behavioral. Re-ran green (budget-guard 9/9).

### ree-abort-reset
verdict:  ✅ SATISFIED
reason:   controller recreated per prompt; behavioral (mock SSE, real reset/abort). Cluster green.

### pi-memory-consolidation-wiring   (was ❌ BROKEN — now FIXED)
verdict:  ✅ SATISFIED
reason:   `createLlmCall` (`one-shot.ts:23-79`) does a real POST and returns assistant text.
          `scheduler-dispatch.ts:39-77` intercepts `taskId==='__memory_consolidation__'` → calls
          `runConsolidation` and returns (no bus publish); normal tasks publish `channelType:'scheduler'`.
          Wired into production: `server.ts:298-313` builds the handler and passes it to `new Scheduler`,
          and `registerJob` inserts the row with `id='__memory_consolidation__'` so the interceptor
          matches at runtime. All 4 scenarios behavioral (mocked fetch return, spy counts, real
          `memory_log` row + `MEMORY.md` write, no bus publish). 6/6 pass. The discovery-miss bug is
          closed.

### memory-consolidation-removal   (ree-only)
verdict:  ✅ SATISFIED
reason:   `bootstrap.ts:33-40` gates the memory job on `sdk !== 'ree'`; S1 (ree schedules none), S3 (pi
          still registers), S4 (callable) behavioral against real `bootstrapServerJobs`/`registerServerJobs`.
          Blemish: the S4-named test (`memory-consolidation-not-scheduled.test.ts:53-56`) is a bare
          `typeof === 'function'` CHEAT, but S4 is redundantly proven by the e2e that actually runs
          `runConsolidation`. Not a gap.

### knowledge-source-delete   (was ⚠️ PARTIAL — S3 unimplemented — now FIXED)
verdict:  ✅ SATISFIED
reason:   `deleteKnowledgeSource` is now CALLED in production from `watcher.ts:81` (the fs-watch
          unlink/stat-fail path), no longer dead code. S1/S2 behavioral against real DB rows; S3 drives
          the real watcher end-to-end (unlink → debounce → row gone), and its load-bearing assertion
          (`watcher-unlink.test.ts:69-70`, path-based) genuinely proves deletion. Minor: a secondary
          assertion (`:64-65`) queries `id='doc1'` but the row's id is `src1` (doc1 is the doc_id column)
          so it is always-true/vacuous — harmless, the path assertion carries the test.

### resilience-abort-journal   (was ⚠️ 100% CHEAT — now FIXED)
verdict:  ✅ SATISFIED
reason:   fully rewritten behavioral (`abort-closes-journal.test.ts`): real Orchestrator + DB, runner
          rejects AbortError → asserts 0 `status='open'` rows AND real `getOpenJournals` exclusion (S1/S2);
          a timing-out runner leaves the journal open (S3 regression). No source-regex remains.

### ree-token-usage   (was ⚠️ PARTIAL — S2 missing — now FIXED)
verdict:  ✅ SATISFIED
reason:   S1 (agent_end usage `{12,7}`) and S2's message_end half are loop-driven through a real
          `prompt()` with a mock SSE stream carrying `usage` (`ree-runner.test.ts:1015-1053, 1217-1263`);
          S3 writes the `usage` row. Core defect (hardcoded zeros) is behaviorally disproven.
focus:    residual test-quality note (not a functional gap): S2's `turn_end` half is proven only by a
          direct `emitTurnEnd` with hand-set values (`ree-chat.test.ts:137`), not driven through the loop.

### ree-before-agent-start-hooks   (was ⚠️ PARTIAL — S2 missing — now FIXED)
verdict:  ✅ SATISFIED
reason:   S2 now captures the actual model request body and asserts the injected `## INJECTED` text is
          on the wire via a real `prompt()` (`ree-runner.test.ts:1265-1315`). S1 merge + S3 no-regression
          behavioral. The previously-missing end-to-end assertion exists.

### ree-tool-errors   (was ⚠️ PARTIAL — now FIXED)
verdict:  ✅ SATISFIED
reason:   S1 now asserts BOTH the `tool_result` event and the `tool_call_end` RunnerEvent carry
          `isError:true`, driven through the loop with a real SSE tool-call stream
          (`ree-runner.test.ts:1069-1176, 1317-1388`); S3 drives a success tool through the loop asserting
          both events `isError:false` (`:1391-1466`); S2 asserts `toTanStackTool.execute` throws.

### ree-security-extensions   (was ⚠️ PARTIAL — still ⚠️ PARTIAL, improved)
verdict:  ⚠️ PARTIAL
reason:   Real progress: the compose (not last-wins) merge of multiple `before_agent_start` returns is
          correct in impl (`ree-chat.ts:194-205`) and proven behaviorally — `extension-subset.test.ts:234-235`
          asserts the injection-guard policy block AND a tool block coexist in the merged prompt; and the
          generic before_agent_start→request-body path is now proven (see ree-before-agent-start S2). BUT
          spec S2's own assertion — injection-guard specifically wired into a ree chat and its
          `<external_content_policy>` text captured on the serialized model request via a real `prompt()`
          — is still not directly asserted (the "S2" test asserts `emitBeforeAgentStart`'s return, not the
          wire; the one `prompt()` test never inspects the request body). And S1/S3 plus trust-enforcer's
          `tool_call` ENFORCEMENT still rest on listener-count / `factories.length` / typeof (CHEAT-class):
          no test proves trust-enforcer actually gates or blocks a tool call.
focus:    tests/runtime/ree-security-end-to-end.test.ts — add a real ree `prompt()` with injection-guard
          wired asserting the policy text on the model request; add a behavioral trust-enforcer test that
          a disallowed tool call is actually blocked. Assert factory identity, not counts.

### scheduler-inflight   (was ⚠️ 100% CHEAT — mostly FIXED)
verdict:  ✅ SATISFIED
reason:   S1 (hanging handler + two polls → dispatched exactly once) and S2 (completion clears `_inFlight`,
          re-dispatch) are genuine behavioral tests against a real `Scheduler`+DB with dispatch-count
          assertions (`inflight-no-double-dispatch.test.ts:37-94`). The source-regex cheat is gone.
focus:    residual: S3 (`:96-120`) only asserts `cancelJob(...).not.toThrow()` and never inspects
          `_inFlight`, so a no-op cancel would also pass — the scenario's specific effect is unproven.
          (Impl at `scheduler.ts:313` is correct; the test is hollow.)

### retention-periodic   (was ⚠️ 100% CHEAT — NOT fixed)
verdict:  ❌ UNSATISFIED  (impl correct; verification is still pure CHEAT)
reason:   `retention-wired.test.ts` is unchanged in spirit — all assertions are `readFileSync(server.ts)`
          + regex/`toContain` (lines 9,14,28,33,38), and the file carries a NOTE (lines 20-25) admitting
          the behavioral test was deliberately skipped. S1/S3 are pure source-string cheats; S2 (the
          load-bearing proof — tiny interval override + over-age row inserted AFTER boot + advance timers
          → row pruned) is entirely MISSING. The impl is correct (`server.ts:163-168` arms the interval,
          `:791` clears it) and the *boot-time* single prune is behaviorally covered by
          `events-retention-wired.test.ts`, but the *periodic* claim this spec is about has zero
          behavioral coverage. A periodic-sweep regression would not be caught.
focus:    the periodic timer is inline in `startServer`, making it awkward to test — extract the arming
          into a small function (e.g. `armRetentionTimer(db, opts, intervalMs)` in `retention.ts`) and
          write a fake-timer test: arm with a tiny interval, insert an over-age row, advance timers,
          assert it is pruned, then clear and assert no further prune. Delete the readFileSync cheats.

## Triage

✅ Fixed since last eval:   pi-memory-consolidation-wiring (BROKEN→SATISFIED), knowledge-source-delete
   (PARTIAL→SATISFIED), resilience-abort-journal (CHEAT→SATISFIED), ree-token-usage, ree-before-agent-start-hooks,
   ree-tool-errors (all PARTIAL→SATISFIED), scheduler-inflight (CHEAT→SATISFIED).

✅ Safe to skip:   ssrf-ip-blocklist, budget-session-window, budget-warning-ordering, ree-abort-reset,
   memory-consolidation-removal.

⚠️  Worth a look:
  1. retention-periodic — ❌ still 100% source-regex cheat; the periodic-sweep behavioral test (S2) is
     missing. Impl correct, verification absent. This is the one remediation item that did NOT land.
  2. ree-security-extensions — ⚠️ S2 on-the-wire injection-guard policy assertion and trust-enforcer
     tool-blocking enforcement are still structural (counts/typeof), not behavioral.
  3. scheduler-inflight S3 — hollow (asserts only `.not.toThrow()`); ree-token-usage turn_end half —
     hand-set, not loop-driven. Minor residues; capabilities otherwise solid.

❓  Human call:    none.

### Non-contract test failures observed in the full run (flagged, not scored)
  - `tests/knowledge/watcher.test.ts` (2) — pass in isolation; fail only under full-suite parallel load
    (500ms `delay()` timing). Load-sensitive flakiness, not a regression.
  - `tests/agent-runner/pi-runner-isolation.test.ts` (2) — fails in isolation too; `setTimeout(500)` race
    on `capturedOptions`. Pre-existing timing flake, outside this contract. Worth de-flaking separately.

---
### retention-periodic — RESOLVED (2026-07-17, follow-up)
The cheat file was replaced with a solid behavioral test. A `armRetentionTimer(db, opts, intervalMs)`
seam was extracted from `startServer` (behavior-preserving — `server.ts` arms and `stopServer` clears
the identical handle), letting the periodic sweep be driven deterministically with fake timers:
`tests/observability/retention-wired.test.ts` now (a) advances the interval and asserts an over-age INFO
row is pruned on the tick, and again on the next tick (proves periodic, not one-shot); (b) asserts a
fresh in-window row survives; (c) after `clearInterval`, asserts a new over-age row is NOT pruned across
5 intervals (teardown/no-leak). Determinism: SQLite's `datetime('now',…)` uses the real clock so seeded
rows are genuinely over-age regardless of fake JS timers; `retentionDays:365` protects real log files.
3 tests, green, typechecks, stable across repeated runs. **retention-periodic verdict flips ❌ → ✅.**
The `events-retention-wired.test.ts` server-boot tests still pass, confirming the extraction is inert.

---
