# Evaluations

## Evaluation — 2026-08-04 12:24

### memory-provider-contract
verdict:  ✅ SATISFIED
reason:   `src/memory-provider.ts` defines the action-shaped `MemoryProvider` with first-class `scope` axis (`MEMORY_SCOPES` = self/human/both), query-based `recall`, opaque `MemoryRef`, and provider-owned `grounding`; every core op threads scope, `both` concatenates self+human, and the builtin/dreem backends implement or degrades all six ops at provider level. All 3 `contract.test.ts` cases and the wider suite pass.
focus:    —

### memory-manager
verdict:  ✅ SATISFIED
reason:   `MemoryManager` (`src/memory-provider.ts` + `makeMemoryExtension`) defaults to `builtin`, `select()` falls back to `builtin` with a logged warning on unknown/unloadable ids (verified in `fake-backend.test.ts`/`manager.test.ts`), holds exactly one active provider, dispatches only opaque refs+scope via the contract, and `listCapabilities()` returns the active provider's declarations. S1–S6 all present.

### builtin-provider
verdict:  ⚠️ PARTIAL
reason:   `builtinMemoryProvider` is a faithful reselection S1–S4: scoped store/update/forget with opaque refs, query `recall` ('both' concatenates), `clear`, `grounding` trimmed to `maxChars`, hot-memory capability declared, and default tool/injection parity covered by `default-parity.test.ts`. S5 is only partially honored: a provider-routed path (`applyOpViaProvider`) exists, but the production wiring `src/scheduler-dispatch.ts:46` and `src/server.ts:348` call `runConsolidation` **without** a `provider`, so the live consolidation job still writes via `memoryAdd`/`memoryReplace`/`memoryRemove` (direct `writeFileSync`), contradicting "never direct file writes."
focus:    src/scheduler-dispatch.ts / src/server.ts — thread the resolved provider into runConsolidation so the job routes via builtin.store

### capability-registry-trust
verdict:  ⚠️ PARTIAL
reason:   S1–S5 are satisfied: `registerCapabilityTools` walks `listCapabilities()` registering one namespaced `memory::<id>::<name>` tool each, schema-validates malformed defs (`isValidCapabilityDef`), injection-scans declared content (`scanInjection`), propagates `minAuthLevel`, and registers via the same `pi.registerTool` as first-party tools — all proven by `capability-registry.test.ts`/`trust-boundary.test.ts`. S6 is missing: nothing marks non-builtin provider recall output as untrusted external content — `pi-runner.ts:139` only scans tools in `injection_guard.external_source_tools` (default `['fetch_url','web_fetch']`), and no code adds provider recall to that policy nor surfaces dreem recall with a treat-as-data tag.
focus:    capability-registry-trust S6 — wire provider recall under injection-guard's external-source policy

### dreem-provider
verdict:  ⚠️ PARTIAL
reason:   `makeDreemProvider` satisfies S1–S4, S6, S7: it delegates recall to the backend `/search`, maps core ops to dreem knowledge writes (`/memory`, PUT/DELETE), degrades each op with `logger.warn` on failure (S6), declares `selfConsolidating`/`hotMemory` so `shouldRunReebootHotMemory` returns false and `registerServerJobs` skips reeboot's job (S3/S4), and config is a discriminated union with `baseUrl` required (S7, `config.ts:188`). S5 is partial: `listCapabilities` declares `dream`/`hot-retrieval`/`graph`/`health` but none carry an `execute` handler (they register as "declared without a handler"), and no `tree`/deeper-search or reeboot view-system integration exists for the non-tool-schema surfaces promised ("using reeboot's view system for non-tool-schema surfaces").
focus:    src/extensions/memory-dreem.ts — add execute handlers / view-system surfaces for declared capabilities

## Triage

✅ Safe to skip:   memory-provider-contract, memory-manager
⚠️  Worth a look:  builtin-provider (S5 — production consolidation bypasses builtin.store, does direct file writes); capability-registry-trust (S6 — provider recall never reaches injection-guard's external-source policy); dreem-provider (S5 — declared capability tools have no execute handlers / no view-system surface)
❓  Human call:    (none — remaining wording in the contract is specific enough)

---
