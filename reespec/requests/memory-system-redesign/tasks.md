# Tasks — memory-system-redesign

> Docs: `brief.md`, `design.md`, `specs/*`. Run tests with `cd reeboot && npx vitest run`.
> ESM `file://` import convention applies (`../memory-provider.js`). Preserve the
> full-suite-green discipline as each slice lands.

## 1. Contract types + interface (GREEN baseline for reshaping)

- [x] **RED** — Write `tests/memory-plug/contract.test.ts`: assert the new `MemoryScope`,
      `MemoryRef`, `MemoryHit`, `CapabilityDef` types and the reshaped `MemoryProvider`
      interface (scope-parameterized `store/update/forget/recall/clear`, provider-owned
      `grounding({scope?,maxChars?})`, `listCapabilities()`) do not yet exist → test fails.
- [x] **ACTION** — Define the reshaped types + interface in `src/memory-provider.ts`,
      keeping the existing `MemoryManager` select/fallback contract intact for now.
- [x] **GREEN** — `npx vitest run tests/memory-plug/contract.test.ts` → passes.

## 2. Manager routes only via refs + scope

- [x] **RED** — Extend `tests/memory-plug/manager.test.ts`: assert the manager dispatches
      core ops passing only opaque refs + scope tokens (a spy provider records it receives
      a `MemoryRef`/scope, never inspects ref internals) → fails (manager still calls old
      add/replace/remove signature).
- [x] **ACTION** — Update `MemoryManager` to delegate the new method signatures to
      `activeProvider` unchanged (no transformation), preserving `select`/fallback.
- [x] **GREEN** — `npx vitest run tests/memory-plug/manager.test.ts` → passes; existing
      manager selection/fallback tests still green.

## 3. builtin provider rebuilt onto the new contract

- [x] **RED** — Write `tests/memory-plug/builtin-provider.test.ts`: builtin implements
      `store/update/forget/recall/clear/grounding` with scope over MEMORY.md/USER.md,
      returns/consumes opaque refs, `'both'` concatenates recall, grounding trims to
      `maxChars` → fails (builtin is still `add/replace/remove/read`).
- [x] **ACTION** — Rebuild `builtinMemoryProvider` in `src/extensions/memory-manager.ts`
      to the new contract, mapping existing entry logic to ref-based store/update/forget.
- [x] **GREEN** — `npx vitest run tests/memory-plug/builtin-provider.test.ts` → passes.

## 4. Default tool + injection behaviour preserved (regression)

- [x] **RED** — Write `tests/memory-plug/default-parity.test.ts`: with no `memory.provider`,
      the `memory` tool and `before_agent_start` grounding produce byte-for-byte the same
      entries/system-prompt block as today → fails while builtin shape changes are mid-flight
      (asserts the OLD source-of-truth behaviour as the contract).
- [x] **ACTION** — Wire the reshaped builtin + manager into `makeMemoryExtension`
      (`memory` tool delegates to `manager.active` new methods; grounding calls
      `grounding()`); keep defaults identical.
- [x] **GREEN** — `npx vitest run tests/memory-plug/default-parity.test.ts` + full
      `tests/memory-plug/*` + `tests/extensions/memory-manager.test.ts` → passes.

## 5. Capability registry + uniform registration

- [x] **RED** — Write `tests/memory-plug/capability-registry.test.ts`: a fake provider
      declares capabilities; the extension registers one namespaced tool per declared
      capability (`memory::<id>::<name>`), same mechanism for builtin/dreem/fake → fails
      (no registry path yet).
- [x] **ACTION** — Add `listCapabilities()` to the contract, a registry walk in the memory
      extension that registers namespaced tools, and `CapabilityDef` typing.
- [x] **GREEN** — `npx vitest run tests/memory-plug/capability-registry.test.ts` → passes.

## 6. Trust boundary — validation, injection scan, gating, namespacing

- [x] **RED** — Write `tests/memory-plug/trust-boundary.test.ts`: malformed capability defs
      are rejected at registration; injectable declared descriptions are blocked by the
      injection scanner; provider tools obey trust-enforcer/permission-tier/minAuthLevel
      gating; names are namespaced → fails (no trust gate on provider tools).
- [x] **ACTION** — Apply the four trust plies at registration: schema validation, injection
      scanning, pass-through of provider tools through existing trust/gating, namespacing.
- [x] **GREEN** — `npx vitest run tests/memory-plug/trust-boundary.test.ts` → passes.

## 7. Config — memory discriminated-union + per-provider providerConfig

- [x] **RED** — `tests/memory-config.test.ts`: `memory` uses a discriminated union on
      `provider`; `builtin` and `dreem` branches validate their own typed `providerConfig`
      (builtin: limits+consolidation; dreem: required `baseUrl`, optional `apiKey`/
      `consolidationInterval`/`llm`); unknown provider or malformed per-provider config is
      rejected; `provider:'builtin'` with no `providerConfig` parses via defaults → fails
      until the union exists. (Verify the zod-4 `discriminatedUnion` API as part of RED.)
- [x] **ACTION** — Add the `memory` discriminated union to `src/config.ts` (zod 4 — use
      explicit `.prefault(() => ({}))` for defaulted object branches); parse `providerConfig`
      typed per provider.
- [x] **GREEN** — `npx vitest run tests/memory-config.test.ts` → passes.

## 8. Provider factory — construct provider from typed providerConfig

- [x] **RED** — Write `tests/memory-plug/provider-factory.test.ts`: a provider-factory
      registry (`registerProvider(id, factory)`) constructs the selected provider from the
      parsed, typed `providerConfig` (builtin reads limits/consolidation; a fake receives its
      typed config) → fails (no factory registry; factory expects bag).
- [x] **ACTION** — Add the provider-factory registry; the memory extension resolves
      `config.memory.provider` through it, passing the typed `providerConfig` builtin/dreem.
- [x] **GREEN** — `npx vitest run tests/memory-plug/provider-factory.test.ts` → passes.

## 9. Consolidation — self-consolidating capability routing

- [x] **RED** — Write `tests/memory-plug/consolidation-routing.test.ts`: a provider declaring
      `selfConsolidating: true` skips reeboot's `__memory_consolidation__` job; a non-self-
      consolidating provider (builtin) triggers reeboot's job which writes insights via
      `provider.store('self', ...)` (never direct file writes) → fails (no capability-gated
      routing; current job writes files directly).
- [x] **ACTION** — Add the standard `selfConsolidating` capability declaration; gate the
      `__memory_consolidation__` scheduler job on the active provider's status; route builtin's
      job through `provider.store`.
- [x] **GREEN** — `npx vitest run tests/memory-plug/consolidation-routing.test.ts` +
      `tests/memory-consolidation*.test.ts` → passes.

## 10. Hot-memory folded under the provider (capability-declared)

- [x] **RED** — Write `tests/memory-plug/hot-memory-cap.test.ts`: builtin declares its
      hot-memory capability; a system that self-serves retrieval prevents reeboot's own
      hot-memory wiring → fails (hot-memory not yet provider-declared).
- [x] **ACTION** — Fold reeboot's hot-memory extension under the provider as a declared
      capability; gate reeboot's own hot-memory wiring on the active provider's declaration.
- [x] **GREEN** — `npx vitest run tests/memory-plug/hot-memory-cap.test.ts` +
      existing `tests/extensions/hot-memory*.test.ts` → passes.

## 11. dreem provider — core ops + delegation

- [x] **RED** — Write `tests/memory-plug/dreem-provider.test.ts`: the dreem provider
      (mock-fetch/HTTP to a configured endpoint) maps `store/update/forget/recall/clear/
      grounding` to dreem knowledge ops, returns/consumes opaque refs (concept path),
      `recall` delegates to dreem's retrieval path → fails (no dreem provider).
- [x] **ACTION** — Implement the dreem provider `src/extensions/memory-dreem.ts` against the
      configured endpoint (from typed `providerConfig`), honoring the contract + graceful
      degradation (S6).
- [x] **GREEN** — `npx vitest run tests/memory-plug/dreem-provider.test.ts` → passes.

## 12. dreem provider — capabilities + self-consolidating + LLM sharing

- [x] **RED** — Write `tests/memory-plug/dreem-capabilities.test.ts`: dreem declares
      self-consolidating, hot-retrieval, and native capabilities (graph/health/tree) via the
      registry; reeboot's consolidation job is skipped; the provider propagates `llm`
      (inherited from reeboot's active model config unless overridden) and
      `consolidationInterval` to the backend requests → fails.
- [x] **ACTION** — Wire dreem's capability declarations + self-consolidating status; register
      its native tools; hook typed config + LLM propagation into provider construction.
- [x] **GREEN** — `npx vitest run tests/memory-plug/dreem-capabilities.test.ts` +
      `tests/memory-plug/*` → passes.

## 13. Integration + docs + full-suite green + coverage gate

- [x] **RED** — Confirm regression: run `cd reeboot && npm run test:coverage` and assert it
      fails / falls below the configured thresholds (statements 80, lines 80, functions 80,
      branches 72) or reports a test regression vs 283 files / 1856 tests; also confirm
      `README.md`/`config.example.json` lack memory-provider + dreem config docs → RED fails
      while any gap remains.
- [x] **ACTION** — Update README / `config.example.json` for provider selection + dreem
      config; fix residual integration/type errors; ensure the new source files
      (contract, builtin rebuild, registry, dreem provider) are covered so overall coverage
      does not regress below the thresholds.
- [x] **GREEN** — `cd reeboot && npx vitest run` and `npm run test:run` report full-suite
      green (283 files / ≥1856 tests, 0 fail), `tsc --noEmit` clean, AND
      `npm run test:coverage` PASSES the thresholds (statements/lines/functions ≥ 80,
      branches ≥ 72). In a restricted sandbox where the full suite pre-fails (see design
      Risks — `~/.reeboot` EPERM + external-service suites), verify the touched-area
      suites + `tsc` instead, and confirm no NEW failures were introduced.

## 14. Memory design documentation — how it works & how to add a provider

- [x] **RED** — Check: no memory doc exists covering (a) how memory is designed and works
      (contract, scope, refs, grounding, capability registry), (b) how a NEW provider is
      implemented (implement `MemoryProvider`, declare capabilities, register factory,
      validate `providerConfig`), (c) how a backend is swapped via config
      (`memory.provider` + typed `providerConfig`) → assertion fails (gaps absent).
- [x] **ACTION** — Author a memory documentation page/section (e.g. `docs/memory.md` and/or
      AGENTS.md section) covering all three, with a worked builtin→dreem swap example.
- [x] **GREEN** — Verify the doc now contains concrete sections for design/contract,
      new-provider implementation, and backend-swap-via-config with a worked example →
      assertion passes.

## 15. Capture decisions in decisions.md

- [x] **RED** — Check: `reespec/decisions.md` lacks entries for the action-shaped contract,
      the capability registry (Option 1) + uniform trust, the delegation model,
      reeboot-owned vs provider-owned boundaries, and the discriminated-union config shape
      → assertion fails.
- [x] **ACTION** — Append the settled decisions (contract shape, scope, refs, grounding
      split, registry + uniform trust, delegation, consolidation ownership, config shape,
      reeboot-owned boundaries) to `reespec/decisions.md`.
- [x] **GREEN** — Verify each decision is captured with its request reference → assertion
      passes.
