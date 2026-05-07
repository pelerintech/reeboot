# Spec: Contract Stub Tests (tier1 / tier2)

## Capability

Make the broken-adapter contract stub tests report as green in vitest while continuing to exercise every contract clause.

## Approach

Add an `expectFail` option to `runChannelContractTests` and `runLiteContractTests`. When passed, the suite uses `it.fails` instead of `it` for every test. This keeps all contract clauses executing, but inverts the pass/fail semantics: tests now PASS when the assertion fails.

```ts
// Shared suite
export function runChannelContractTests(factory: Tier1Factory, expectFail = false): void {
  const _it = expectFail ? it.fails : it;
  // every test inside uses _it('...', ...)
}

// Broken stub test file
runChannelContractTests(brokenFactory, true);
```

## File: `tests/channels/contract/runContractTests.ts`

### Changes

- [ ] Add `expectFail = false` parameter to `runChannelContractTests`
- [ ] Add `const _it = expectFail ? it.fails : it;` at top of function
- [ ] Replace every `it(` with `_it(` inside the function body

### Verification
- [ ] `npm run test:run -- tests/channels/contract/tier1.contract.test.ts` → 0 failures reported
- [ ] Sanity: temporarily remove `throw` from `BrokenTier1Adapter.send` → at least one test flips to FAIL (proving validation still active)

## File: `tests/channels/contract/runLiteContractTests.ts`

### Changes

- [ ] Same pattern: `expectFail = false` parameter, `_it` alias, replace all `it` with `_it`

### Verification
- [ ] `npm run test:run -- tests/channels/contract/tier2.contract.test.ts` → 0 failures reported
- [ ] Same sanity check as tier1

## Real Adapter Contract Tests

The following files call the shared suite for **real** adapters. They must NOT be modified — calling without `expectFail` must remain the default:

- `tests/channels/whatsapp.contract.test.ts`
- `tests/channels/signal.contract.test.ts`
- `tests/channels/web.contract.test.ts`

These must continue to pass normally (no `it.fails` wrapping).

