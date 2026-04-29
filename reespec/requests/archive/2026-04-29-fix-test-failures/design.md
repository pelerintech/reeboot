# Fix Test Suite Failures — Design Doc

## Overview

Two categories of test failures, two strategies.

```
┌─────────────────────────────────────────────────────────────┐
│                    Test Suite (855 tests)                     │
├─────────────────────────────────────────────────────────────┤
│  838 passing                                                │
│  15 failing  ────┬─── 5  proactive-agent (implementation drift)│
│                  └─── 10 contract stubs (intentional by design) │
└─────────────────────────────────────────────────────────────┘
```

## Strategy A: Proactive-Agent Heartbeat Tests (Implementation Drift)

### What Changed

`src/scheduler/heartbeat.ts` was refactored from a callback-based model to a bus-based model:

**Before:**
```ts
startHeartbeat(config, db, orchestrator)
// orchestrator.handleHeartbeatTick() called per tick
// orchestrator.sendToDefaultChannel() called for non-IDLE results
```

**After:**
```ts
startHeartbeat(config, db, bus)
// bus.publish(createIncomingMessage({ channelType: 'heartbeat', ... })) per tick
// Orchestrator handles IDLE suppression and default-channel routing
// via its ordinary incoming-message path ( `_reply()` line 521+ )
```

### What Must Change in Tests

| Old Test | Problem | New Test |
|---|---|---|
| `disabled by default` | Passes by accident (wrong signature) | Fix signature: pass `bus`, assert `publish` not called |
| `fires at configured interval` | Spies on deprecated `handleHeartbeatTick` | Spy on `bus.publish`, assert called once |
| `fires multiple times` | Same | Assert `bus.publish` called twice |
| `passes contextId` | `contextId` no longer passed as explicit arg | Assert published message contains `peerId: 'main'` |
| `IDLE response suppressed` | Tests orchestrator concern, not heartbeat | **Remove** — covered in `orchestrator.test.ts` |
| `non-IDLE response sent` | Tests orchestrator concern, not heartbeat | **Remove** — covered in `orchestrator.test.ts` |
| `IDLE detection is case-insensitive` | Tests orchestrator concern, not heartbeat | **Remove** — covered in `orchestrator.test.ts` |
| `stopHeartbeat prevents further ticks` | Spies on deprecated method | Assert `bus.publish` count stays at 1 after stop |

Net: **~6 tests** exercising the actual `startHeartbeat` + `bus.publish` flow.

## Strategy B: Contract Stub Tests (Intentional Failures)

### Why They Exist

The channel contract suites (`runContractTests.ts`, `runLiteContractTests.ts`) define shared behavioral expectations for ALL channel adapters. The broken-stub files (`tier1.contract.test.ts`, `tier2.contract.test.ts`) run the same suites against deliberately-malformed adapters to confirm every contract clause is actually enforced.

If these stubs started passing, it would mean the contract suite no longer catches violations — a **regression in the contract suite itself**.

### How to Keep Them Validating Without Breaking CI

Use vitest's `it.fails` / `describe.fails`: a test wrapped in `.fails` reports as **PASS** when its body throws/fails, and reports as **FAIL** when its body succeeds. This inverts the semantics:

```
normal it:     PASS if body passes, FAIL if body throws
it.fails:      PASS if body throws, FAIL if body passes
```

For our stubs, every clause is designed to fail, so `it.fails` makes them report as passing while still exercising the full contract suite.

### Approach for Shared Suite

The shared suites (`runContractTests.ts`, `runLiteContractTests.ts`) are imported by BOTH:
- **Real adapter contract tests** (whatsapp, signal, webchat) — must run normally
- **Broken stub tests** — must run under `.fails`

Therefore `.fails` cannot live in the shared suite. It must be injected from the stub test files.

**Chosen approach:** Wrap the `runChannelContractTests()` / `runLiteContractTests()` invocation in each stub file inside a `describe.fails` block (or equivalent scope-level wrapper). This ensures all inner `it()` blocks within that describe fail "upwards" as passes.

### Documentation Requirement

Both stub files MUST carry a prominent comment block explaining:
1. These tests are intentionally broken
2. They validate the contract suite's enforcement power
3. If they start failing (showing up red in vitest), the contract suite ITSELF is broken
4. Do not "fix" the broken adapters
