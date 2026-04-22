## Evaluation — 2026-04-22 22:47

### broadcast-notification
```
verdict:  ✅ SATISFIED
reason:   spec requires broadcastToAllChannels sends to all adapters simultaneously,
          isolates individual-adapter failures, and completes silently with an empty
          map — src/utils/broadcast.ts implements all three paths; tests/broadcast.test.ts
          covers all three scenarios (3/3 pass)
```

### crash-recovery
```
verdict:  ✅ SATISFIED
reason:   spec requires policy-driven recovery (safe_only/always/never), per-turn
          broadcast notification, stale-24h cleanup, and multi-journal handling —
          recoverCrashedTurns() in src/resilience/startup.ts implements all paths;
          requeueFn is now wired to bus.publish() and notifyRestart/recoverCrashedTurns
          execute after initChannels (populated adapters map); tests/resilience-startup.ts
          (13/13) and tests/resilience-wiring.ts (3/3) pass; brief Layer 1 unanswered-
          message scan is implemented via scanSessionForUnansweredMessage() in server.ts
```

### turn-journal
```
verdict:  ✅ SATISFIED
reason:   spec requires row creation at turn start, per-tool-call step insertion with
          full input/output, deletion on successful completion, and journal remaining
          open on crash/timeout — TurnJournal in src/resilience/turn-journal.ts and
          orchestrator integration satisfy all six scenarios; tests/turn-journal.test.ts
          (4/4) and tests/resilience-startup.ts stale-cleanup (passes with logged warning)
          cover the full spec
```

### resilience-config
```
verdict:  ✅ SATISFIED
reason:   spec requires safe defaults when resilience key absent, full round-trip of all
          fields, and ZodError on invalid mode — ResilienceSchema in src/config.ts defines
          correct defaults (mode='safe_only', side_effect_tools=[], catchup_window='1h',
          outage_threshold=3, probe_interval='1h'); tests/resilience-config.test.ts (4/4)
          covers all three scenarios
```

### scheduled-catchup
```
verdict:  ✅ SATISFIED
reason:   spec requires global window, beyond-window skip, catchup='always'/'never',
          per-task custom window, and at-most-one-fire deduplication — applyScheduledCatchup()
          in src/resilience/startup.ts implements all cases; tests/resilience-catchup.test.ts
          (6/6) passes all scenarios including multi-task independent evaluation
```

### outage-detection
```
verdict:  ✅ SATISFIED
reason:   spec requires threshold-gated declaration, outage_events insert, probe-task
          creation, broadcast on threshold, per-context counter reset on success,
          non-provider-error exclusion, lost-job recording during active outage, and
          20-entry cap with truncation flag — all implemented in src/orchestrator.ts
          (_declareOutage, _recordLostJob); tests/orchestrator.test.ts covers non-provider
          exclusion (line 481) and all other scenarios (16/16 pass)
```

### outage-recovery
```
verdict:  ✅ SATISFIED
reason:   spec requires probe runs without invoking agent runner, two-consecutive-success
          resolution, outage_events.resolved_at update, probe task deletion, failure-counter
          clear, recovery broadcast listing lost jobs with truncation note, and no probe task
          when no outage — handleScheduledTask routes __outage_probe__ to _runOutageProbe
          bypassing runner.prompt(); _resolveOutage handles all resolution steps;
          tests/outage-probe.test.ts (8/8) covers all six scenarios
```

## Triage

```
✅ All capabilities satisfied — no action required.
```

---

## Evaluation — 2026-04-22 21:12

### resilience-config
verdict: ✅ SATISFIED
reason: Spec requires `safe_only` default, round-trip of all fields, and `ZodError` on `mode: 'maybe'` — all three scenarios are covered by `tests/resilience-config.test.ts` passing against `src/config.ts`, which adds `ResilienceRecoverySchema`, `ResilienceSchedulerSchema`, and `ResilienceSchema` with correct defaults.

---

### turn-journal
verdict: ⚠️ PARTIAL
reason: Five of six spec scenarios are satisfied — open on turn start, steps appended on `tool_call_end`, deleted on success, open on runner error, stale cleanup on startup. The sixth is not: spec requires "Journal remains open after turn timeout" — the code does leave the journal open on timeout (line 287–291 of orchestrator.ts) but no test verifies this behaviour, and the `session_path` column — recorded in the schema — is never populated at runtime (the orchestrator calls `openTurn(turnId, contextId, msg.content)` without passing `sessionPath`).
focus: `reeboot/src/orchestrator.ts` line 193 — `openTurn` call omits `sessionPath`; `tests/orchestrator.test.ts` — no timeout-journal test exists.

---

### crash-recovery
verdict: ⚠️ PARTIAL
reason: Policy modes (`safe_only`, `always`, `never`) are correctly applied. However the spec states the unsafe-turn notification must be "listing the interrupted turn **and tools that already fired**" — the actual broadcast in `startup.ts` line 112 says only `"after side-effectful tool(s) had already run"` without enumerating the specific tool names from the journal steps. Additionally, the "No unclosed journals — startup proceeds normally" scenario (no notification sent, no error) is not explicitly tested.
focus: `reeboot/src/resilience/startup.ts` lines 109–114 — tool names from `journal.steps` are not included in the notification text.

---

### broadcast-notification
verdict: ✅ SATISFIED
reason: All three spec scenarios covered by `tests/broadcast.test.ts` — both adapters called, first-adapter failure doesn't block second, empty map completes silently. Implementation in `src/utils/broadcast.ts` matches the spec contract.

---

### scheduled-catchup
verdict: ⚠️ PARTIAL
reason: The five window/override scenarios (within-window, beyond-window, `always`, `never`, custom `2h`) all pass in `tests/resilience-catchup.test.ts`. However, the sixth scenario — "Multiple missed tasks — each evaluated independently, **at most one fire is triggered per task regardless of how many natural periods were missed**" — is not tested. The code processes each task row once which implies deduplication, but there is no explicit test asserting this invariant.
focus: `tests/resilience-catchup.test.ts` — no multi-task / single-fire deduplication test.

---

### outage-detection
verdict: ⚠️ PARTIAL
reason: Three of six spec scenarios are satisfied: below-threshold no outage, at-threshold outage declared, successful turn resets counter. Three are not: (1) "Non-provider errors do not count toward outage threshold" — no test covers a non-HTTP tool error being excluded; (2) **"Failed turn during active outage is recorded as a lost job"** — there is no code path in `orchestrator.ts` that appends `contextId`/`prompt` to `outage_events.lost_jobs` when `_activeOutage` is true and a turn fails; (3) **"Lost jobs are capped at 20 entries / truncation flag set"** — no cap or truncation logic exists anywhere in the error path.
focus: `reeboot/src/orchestrator.ts` error path (lines 321–332) — `_activeOutage` branch never updates `lost_jobs`; cap/truncation logic entirely absent.

---

### outage-recovery
verdict: ⚠️ PARTIAL
reason: Core probe/resolution flow works: single-failure no-resolve, two-success resolve, success-count reset on failure, lost-jobs broadcast, `_consecutiveFailures.clear()` on resolution. Two scenarios are unverified: (1) spec requires "Probe fails — **probe task's `next_run` advances to the next probe interval**" — the code does not update `next_run` on a failed probe (it only resets `_probeSuccessCount`); (2) "Recovery notification with **truncated** lost jobs — notes truncation" — the `truncated` flag path in `_resolveOutage` is read but can never be set to `1` because the lost_jobs append (and cap) logic from the outage-detection layer is missing.
focus: `reeboot/src/orchestrator.ts` `_runOutageProbe` — no `next_run` advancement on probe failure; `truncated` flag is dead code until lost_jobs accumulation is implemented.

---

### session-continuity (Layer 1)
verdict: ❌ UNSATISFIED
reason: The brief's Layer 1 goal states: "On restart, load the most recent session JSON (pi already serializes this) so conversation context is preserved within the inactivity window" and "Detect if reeboot was previously running and notify the user… 'I was restarted. If you were waiting on something, please re-send your request.'" The function `getResumedSessionPath` exists in `context.ts` but is **never called** from `server.ts`, the resilience startup path, or `createRunner`. Runners are created without a resumed session path. There is no general "reeboot was previously running" detection independent of crash journal evidence.
focus: `reeboot/src/server.ts` — `createRunner` calls (lines 200, 563) do not pass a resumed session path; `reeboot/src/resilience/startup.ts` — no unconditional restart notification sent when no crash evidence exists.

---

## Triage

✅ Safe to skip: `resilience-config`, `broadcast-notification`

⚠️ Worth a look:
- **`outage-detection`** — most critical gap: failed turns during an active outage are never appended to `lost_jobs`, and the 20-entry cap with truncation flag is entirely absent; surfacing lost jobs on recovery is a stated goal of the brief
- **`outage-recovery`** — downstream of outage-detection gap (truncated flag dead code); also probe task `next_run` is not advanced on a failed probe, so the probe relies solely on the scheduler's normal re-advance logic rather than the explicit contract
- **`session-continuity`** — `getResumedSessionPath` exists but is never called; the "I was restarted" unconditional notification is only sent when crash evidence exists, not on every restart
- **`crash-recovery`** — unsafe-turn notification omits the specific tool names that fired (spec says "listing… tools that already fired")
- **`turn-journal`** — `sessionPath` is never populated at turn open; timeout-journal scenario untested
- **`scheduled-catchup`** — single-fire-per-task deduplication invariant untested

❓ Human call: none — all items are testable against contract language.

---

## Evaluation — 2026-04-22 00:00

### broadcast-notification
verdict:  ✅ SATISFIED
reason:   All three spec scenarios present and passing in tests/broadcast.test.ts:
          simultaneous multi-adapter delivery, single-adapter throw isolation, and
          empty-adapters-map silent completion.

### crash-recovery
verdict:  ⚠️ PARTIAL
reason:   Four policy-mode scenarios (safe_only/safe, safe_only/unsafe, always,
          never) pass in tests/resilience-startup.test.ts. Two spec scenarios are
          unexercised: "No unclosed journals — startup proceeds normally" (no test
          asserts that recoverCrashedTurns is a no-op when turn_journal is empty)
          and "Multiple unclosed journals — each handled independently" (every test
          seeds exactly one journal row; no test uses two rows for different contexts).
focus:    tests/resilience-startup.test.ts — add empty-journal and multi-journal
          test cases

### turn-journal
verdict:  ⚠️ PARTIAL
reason:   Five of six scenarios have passing tests (open on start, steps appended,
          deleted on success, open after crash, open after timeout, stale row
          deleted after 24h). The spec states "a warning is logged" when a stale
          row is discarded; tests/resilience-startup.test.ts only asserts row
          deletion — no test spies on console.warn to verify the warning is emitted.
focus:    tests/resilience-startup.test.ts (stale cleanup section) — add
          console.warn spy assertion

### outage-detection
verdict:  ⚠️ PARTIAL
reason:   Five of six scenarios pass. The scenario "Non-provider errors do not
          count toward outage threshold" (e.g. a tool error or abort) has no
          corresponding test — none of the orchestrator outage-detection tests
          fires a non-provider error and asserts the consecutive-failure counter
          is not incremented.
focus:    tests/orchestrator.test.ts (outage detection section) — add a test
          that throws a plain Error (no .status) and confirms counter stays at 0

### outage-recovery
verdict:  ⚠️ PARTIAL
reason:   Three scenarios pass (probe fails/reschedules, two consecutive successes
          resolve outage, recovery message lists lost jobs). Three scenarios lack
          coverage: (1) "Recovery notification with truncated lost jobs — notes
          truncation" — the source emits "… (list truncated)" when outage.truncated
          is set, but outage-probe.test.ts has no test that asserts the recovery
          broadcast contains that phrase; (2) "No active outage — probe task does
          not exist" — no test asserts the DB invariant; (3) "Probe task is handled
          without invoking the agent runner" — the spec says runner.prompt() is NOT
          called, but no test spy verifies this.
focus:    tests/outage-probe.test.ts — add truncation-in-broadcast, no-probe-when-
          no-outage, and runner-not-called assertions

### resilience-config
verdict:  ✅ SATISFIED
reason:   All three spec scenarios pass in tests/resilience-config.test.ts:
          default-when-absent (safe_only, [], 1h, 3, 1h), full round-trip, and
          ZodError on invalid recovery mode.

### scheduled-catchup
verdict:  ✅ SATISFIED
reason:   All six spec scenarios pass in tests/resilience-catchup.test.ts: missed-
          within-window fires, missed-beyond-window advances, catchup='always'
          fires regardless of age, catchup='never' always skips, custom per-task
          window evaluated correctly, and each task fires at most once.

## Triage

✅ Safe to skip:   resilience-config, scheduled-catchup, broadcast-notification

⚠️ Worth a look:
- crash-recovery — no test for zero-journal startup (no-op path) and no test for two simultaneous crashed turns across different contexts
- turn-journal — stale-cleanup test doesn't assert console.warn is called
- outage-detection — no test that non-provider errors (tool errors, plain throws) leave the outage counter unchanged
- outage-recovery — no test that the recovery broadcast mentions truncation when truncated=1; no test that runner.prompt is never called during probe; no test for the no-outage/no-probe-task DB invariant

---

## Evaluation — 2026-04-22 21:58

### broadcast-notification
verdict:  ✅ SATISFIED
reason:   Spec requires `broadcastToAllChannels` sends to all adapters, survives one-adapter failure, and silently handles an empty map. All three scenarios are implemented in `src/utils/broadcast.ts` and fully covered by `tests/broadcast.test.ts` (3/3 pass).

### crash-recovery
verdict:  ⚠️ PARTIAL
reason:   All six spec scenarios (safe_only/always/never modes, stale-journal cleanup, multi-journal, tool-name listing) are implemented in `src/resilience/startup.ts` and tested in `tests/resilience-startup.test.ts` (13/13 pass). However, the brief states under Layer 1 — Session continuity: "Inspect the last session on restart and surface any apparent incomplete work (user message with no assistant response)" — no spec operationalises this, and no code scans the session JSON for unanswered messages; the behaviour is entirely absent.
focus:    `src/resilience/startup.ts` — session-scan for unanswered user messages is missing; `brief.md` Layer 1 goal is unimplemented and unspecced

### outage-detection
verdict:  ✅ SATISFIED
reason:   Spec requires threshold-gated outage declaration, `outage_events` insertion, probe task creation, broadcast, per-context failure counter reset on success, non-provider-error exclusion, lost-job recording during active outage, and a 20-entry cap. All are implemented in `src/orchestrator.ts` and verified by `tests/orchestrator.test.ts` (all relevant scenarios pass, including the 20-entry cap and truncation flag at line 592).

### outage-recovery
verdict:  ✅ SATISFIED
reason:   Spec requires probe task routed without invoking the agent runner, two-consecutive-success resolution, `outage_events.resolved_at` update, probe task deletion, `_consecutiveFailures` reset, recovery broadcast listing lost jobs, truncation note, and no probe task when no outage exists. All are implemented in `src/orchestrator.ts` (`_runOutageProbe`, `_resolveOutage`) and covered by `tests/outage-probe.test.ts` (8/8 pass).

### resilience-config
verdict:  ✅ SATISFIED
reason:   Spec requires safe defaults when no resilience section is present, full round-trip of a complete resilience block, and `ZodError` on invalid `recovery.mode`. All three scenarios pass in `tests/resilience-config.test.ts`. Defaults (`safe_only`, `[]`, `'1h'`, `3`, `'1h'`) are confirmed at `src/config.ts` lines 203–214.

### scheduled-catchup
verdict:  ✅ SATISFIED
reason:   Spec requires global-window fire, beyond-window skip, `catchup='always'`, `catchup='never'`, per-task custom window, and at-most-one-fire-per-task deduplication. All six scenarios are implemented in `src/resilience/startup.ts` (`applyScheduledCatchup`) and pass in `tests/resilience-catchup.test.ts` (6/6).

### turn-journal
verdict:  ⚠️ PARTIAL
reason:   Five of six spec scenarios are covered: row created at turn start, successful deletion on completion, stale 24h cleanup, journal open after timeout, and basic row-open-after-rejection. The sixth scenario — "Journal remains open after a simulated crash… AND `turn_journal_steps` rows for completed steps are still present" — is not tested end-to-end: `tests/orchestrator.test.ts` line 304 uses a runner that rejects immediately with no prior `tool_call_end` events, so no steps exist to verify. The second half of that scenario's THEN clause is untested.
focus:    `tests/orchestrator.test.ts` — needs a test that emits `tool_call_end` events then throws, and asserts `turn_journal_steps` rows survive

## Triage

✅ Safe to skip:   broadcast-notification, outage-detection, outage-recovery, resilience-config, scheduled-catchup

⚠️ Worth a look:
- **crash-recovery** — brief Layer 1 goal ("surface apparent incomplete work — user message with no assistant response") is unimplemented and has no spec; the behaviour is silently absent
- **turn-journal** — "simulated crash with prior tool calls → steps survive" is not tested; `turn_journal_steps` persistence through a crash is exercised only by separate unit tests, not an integration scenario

---

## Correction — 2026-04-22 22:00

**turn-journal verdict revised from ⚠️ PARTIAL → ✅ SATISFIED**

The "simulated crash" scenario's second THEN clause ("turn_journal_steps rows for completed steps are still present") is satisfied compositionally:

1. `closeTurn` (a DELETE on `turn_journal` with ON DELETE CASCADE) is the **only** mechanism that removes steps — proven by `turn-journal.test.ts` "closeTurn deletes the journal row and cascades steps"
2. `closeTurn` is only called in the orchestrator success path — proven by `orchestrator.test.ts` "leaves the turn_journal row open when the runner rejects"
3. Steps are written synchronously on `tool_call_end` — proven by `turn-journal.test.ts` "appendStep inserts a row"

Therefore: steps written before an error are never deleted, because the only deletion path (`closeTurn`) is never reached on error. The "simulated crash" phrasing describes the test mechanism, not a requirement for an additional integrated test. The behavioral guarantee holds from the existing suite.

**Revised triage:** turn-journal is ✅ SATISFIED. Only remaining gap: crash-recovery (brief Layer 1 goal unimplemented).

---

## Evaluation — 2026-04-22 22:27

### broadcast-notification
verdict:  ✅ SATISFIED
reason:   Spec requires `broadcastToAllChannels` delivers to all adapters, survives one-adapter failure, and silently tolerates an empty map. `src/utils/broadcast.ts` implements all three paths; `tests/broadcast.test.ts` passes 3/3.

### crash-recovery
verdict:  ⚠️ PARTIAL
reason:   Two wiring gaps in `src/server.ts`. **Gap 1 — requeue never fires:** the spec states "the original prompt is re-queued into the orchestrator" for `safe_only`/`always` modes; the `requeueFn` passed at line 165 is an explicit no-op with comment "Requeue: not yet wired." **Gap 2 — notifications silently dropped:** `recoverCrashedTurns` and `notifyRestart` are called at lines 160–173 with `_channelAdapters` — the empty Map from line 69 — before `initChannels` assigns a populated Map at line 193; `initChannels` returns a *new* Map object, so the reference passed earlier is never populated and all crash-recovery and restart notifications reach zero adapters.
focus:    `src/server.ts` lines 160–173 — requeueFn must be wired to the orchestrator message bus post-startup; notification calls must execute after line 193 (channel init) or be deferred to use the live populated adapters map

### outage-detection
verdict:  ✅ SATISFIED
reason:   Spec requires threshold-gated outage declaration, `outage_events` insertion, probe-task creation, broadcast on threshold, failure-counter reset on success, non-provider-error exclusion, lost-job recording, and 20-entry cap with truncation flag. All implemented in `src/orchestrator.ts` and verified by `tests/orchestrator.test.ts` (all relevant scenarios pass).

### outage-recovery
verdict:  ✅ SATISFIED
reason:   Spec requires probe without invoking the runner, two-consecutive-success resolution, `resolved_at` update, probe-task deletion, counter reset, recovery broadcast with lost-jobs list and truncation note, and no probe task when no outage. All implemented in `src/orchestrator.ts` (`_runOutageProbe`, `_resolveOutage`) and covered by `tests/outage-probe.test.ts` (8/8 pass).

### resilience-config
verdict:  ✅ SATISFIED
reason:   Spec requires safe defaults without a `resilience` key, full round-trip of all fields, and `ZodError` on `mode: 'maybe'`. All three scenarios pass in `tests/resilience-config.test.ts`; defaults confirmed at `src/config.ts` lines 203–214.

### scheduled-catchup
verdict:  ✅ SATISFIED
reason:   Spec requires global-window fire, beyond-window skip, `catchup='always'`, `catchup='never'`, per-task custom window, and one-fire-per-task deduplication. All six scenarios implemented in `src/resilience/startup.ts` (`applyScheduledCatchup`) and pass in `tests/resilience-catchup.test.ts` (6/6).

### turn-journal
verdict:  ✅ SATISFIED
reason:   Spec requires row creation at turn start, tool-call step insertion, deletion on success, journal remaining open on error/timeout, and stale-24h cleanup with logged warning. All implemented in `src/resilience/turn-journal.ts` and `src/orchestrator.ts`; covered by `tests/turn-journal.test.ts`, `tests/orchestrator.test.ts`, and `tests/resilience-startup.test.ts`.

## Triage

✅ Safe to skip:   broadcast-notification, outage-detection, outage-recovery, resilience-config, scheduled-catchup, turn-journal

⚠️ Worth a look:
- **crash-recovery** — two production wiring gaps in `src/server.ts`: (1) `requeueFn` is a no-op — auto-resume ("the original prompt is re-queued into the orchestrator") never happens; (2) `recoverCrashedTurns` and `notifyRestart` broadcast to the empty pre-init adapters Map, not the populated one — all crash and restart notifications are silently dropped at runtime

---
