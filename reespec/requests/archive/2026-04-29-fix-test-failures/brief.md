# Fix Test Suite Failures — Request Brief

## Problem Statement

The test suite currently reports **15 failing tests** across **3 test files** (out of ~855 total tests). Without a clean CI signal, new regressions are hard to spot and the team loses trust in the test suite as a safety net.

## Failure Taxonomy

The 15 failures split into two distinct categories requiring different fixes:

### A. Implementation Drift (5 tests, `proactive-agent.test.ts`)

**What broke:** `src/scheduler/heartbeat.ts` was refactored to a **bus-based model** (`startHeartbeat(config, db, bus)` → `bus.publish(createIncomingMessage(...))`). The tests still pass a `{ handleHeartbeatTick, sendToDefaultChannel }` orchestrator object, and `vi.advanceTimersByTimeAsync` never reaches the old orchestrator methods because `bus.publish` throws at runtime (the test's mock bus lacks a `publish` method).

**Root cause:** The heartbeat implementation changed from "orchestrator calls heartbeat → heartbeat calls back into orchestrator" to "heartbeat publishes a message on the bus → orchestrator handles it via incoming-message flow like any other channel". The tests were never updated to reflect this.

**Fix category:** Update tests to match the new bus-based implementation.

### B. Contract Test Stubs (10 tests, `tier1.contract.test.ts` + `tier2.contract.test.ts`)

**What they are:** These files run a shared contract suite against intentionally-broken adapter stubs (`BrokenTier1Adapter`, `BrokenTier2Adapter`). By design, every clause should fail — confirming the contract suite catches real violations.

**Root cause:** This is intentional per `decisions.md` (2026-04-23, "Channel contract test stubs intentionally fail"). But vitest's default output treats every failure as a regression, making them indistinguishable from real bugs.

**Fix category:** Keep the validation behavior, but change test semantics so they pass CI cleanly without losing the "contract enforcement is working" signal.

## Acceptance Criteria

1. All **838+ tests pass** or are **explicitly expected-failing** (via vitest's `it.fails`) — CI exits 0.
2. The 5 proactive-agent heartbeat tests exercise the **actual current implementation** (bus-based publishing), not the deprecated orchestrator API.
3. The 10 contract-stub tests remain as-validating-the-contract-suite, but report as **passing in vitest output** (e.g., via `it.fails`).
4. Each contract test file carries a **comment block** explaining that failure is intentional and should not be "fixed".
5. No changes to contract-suite logic itself — only the stub-adapters' expected-failure markers change.

## Out of Scope

- Changing the contract-suite shared code (`runContractTests.ts`, `runLiteContractTests.ts`)
- Changing the real heartbeat implementation (it is correct; only tests are stale)
- Adding new features (e.g., heartbeat tool, interval config UI)

## Risks

| Risk | Mitigation |
|------|------------|
| `it.fails` unavailable in vitest 1.6.1 | Verify in a one-off test fixture before relying on it |
| Proactive-agent tests cover nuanced orchestrator interactions | Preserve test intent: verify bus message published, correct channelType, IDLE suppression, correct intervals |
| Contract stubs may silently stop exercising contract clauses if we over-mock | Use `it.fails` (expects-throw), not `it.skip` — the suite must still run |

## TDD Approach (for planning phase)

- Phase 1: Fix contract stubs to use `it.fails` or `test.fails` — verify CI exits 0.
- Phase 2: Update proactive-agent tests to target bus-based `startHeartbeat`.
- Phase 3: Full `npm run test:run` — confirm 0 failures.
