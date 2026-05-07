# Tasks — Fix Test Suite Failures

## Task 1: Add `expectFail` option to `runContractTests.ts`

**File:** `tests/channels/contract/runContractTests.ts`
**Goal:** Shared suite supports flagged-failure mode for broken-stub tests.

### RED ✅
- [x] File uses plain `it(...)` for every test

### GREEN ✅
- [x] Add `expectFail = false` parameter to `runChannelContractTests`
- [x] Add `const _it = expectFail ? it.fails : it;` at top of function
- [x] Replace all `it(` with `_it(` in function body (8 tests total)

## Task 2: Add `expectFail` option to `runLiteContractTests.ts`

**File:** `tests/channels/contract/runLiteContractTests.ts`
**Goal:** Same pattern for Tier 2 shared suite.

### RED ✅
- [x] File uses plain `it(...)` for every test

### GREEN ✅
- [x] Add `expectFail = false` parameter to `runLiteContractTests`
- [x] Add `const _it = expectFail ? it.fails : it;` at top of function
- [x] Replace all `it(` with `_it(` in function body (6 tests total)

## Task 3: Wire tier1 broken stub to use `it.fails`

**File:** `tests/channels/contract/tier1.contract.test.ts`
**Goal:** Stub tests report as PASS via `.fails` semantics.

### RED ✅
- [x] `npm run test:run -- tests/channels/contract/tier1.contract.test.ts` shows 6 failures

### GREEN ✅
- [x] Update file comment to `⚠️ INTENTIONALLY BROKEN` warning format
- [x] Pass `true` as second arg: `runChannelContractTests(brokenFactory, true)`

### Verification
- [x] `npm run test:run -- tests/channels/contract/tier1.contract.test.ts` → 0 failures reported
- [x] Sanity: temporarily remove `throw` from `BrokenTier1Adapter.send` → at least one test flips to FAIL

## Task 4: Wire tier2 broken stub to use `it.fails`

**File:** `tests/channels/contract/tier2.contract.test.ts`
**Goal:** Stub tests report as PASS via `.fails` semantics.

### RED ✅
- [x] `npm run test:run -- tests/channels/contract/tier2.contract.test.ts` shows 4 failures

### GREEN ✅
- [x] Update file comment to `⚠️ INTENTIONALLY BROKEN` warning format
- [x] Pass `true` as second arg: `runLiteContractTests(brokenFactory, true)`

### Verification
- [x] `npm run test:run -- tests/channels/contract/tier2.contract.test.ts` → 0 failures reported
- [x] Sanity: temporarily remove `throw` from `BrokenTier2Adapter.send` → at least one test flips to FAIL

## Task 5: Rewrite proactive-agent heartbeat tests for bus-based API

**File:** `tests/proactive-agent.test.ts`
**Goal:** Tests exercise actual `startHeartbeat(config, db, bus)` implementation.

### RED ✅
- [x] `npm run test:run -- tests/proactive-agent.test.ts` shows 5 failures in `System heartbeat`

### GREEN ✅
- [x] Rewrite `disabled by default` test — import `MessageBus`, spy on `bus.publish`
- [x] Rewrite `fires at configured interval` test — assert `bus.publish` called once
- [x] Rewrite `fires multiple times` test — assert `bus.publish` called twice
- [x] Replace `passes contextId to handleHeartbeatTick` with `published message has correct channelType, peerId, and content`
- [x] Rewrite `stopHeartbeat prevents further ticks` — assert `publish` count stays static after stop
- [x] Delete `IDLE response suppressed — sendToDefaultChannel not called`
- [x] Delete `non-IDLE response sent to default channel`
- [x] Delete `IDLE detection is case-insensitive`
- [x] All `TimerManager` tests (1.2, 1.3, 1.4) untouched and still pass

### Verification
- [x] `npm run test:run -- tests/proactive-agent.test.ts` → 0 failures

## Task 6: Full suite regression check

**Goal:** Confirm zero regressions across the entire test suite.

### RED ✅
- [x] `npm run test:run` shows 15 failures

### GREEN ✅
- [x] `npm run test:run` shows 0 failures
- [x] No real adapter contract tests affected
- [x] `orchestrator.test.ts` still passes without modification
- [x] Duration within baseline (no new slowdown from test changes)
