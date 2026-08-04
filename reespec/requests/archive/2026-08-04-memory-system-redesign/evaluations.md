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
## Evaluation — 2026-08-04 14:29

### memory-provider-contract
verdict:  ⚠️ PARTIAL
reason:   S1–S4, S6 are solid — `src/memory-provider.ts` defines scope/refs/query-recall/grounding and `tests/memory-plug/contract.test.ts` + `builtin-provider.test.ts` pass. But S5's "self-policed size ceiling" is violated by dreem: `memory-dreem.ts` grounding does `void opts` — neither `scope` nor `maxChars` is forwarded or enforced (test `dreem-provider.test.ts:89` passes `maxChars: 200` and asserts the raw backend digest is returned untrimmed).
focus:    `reeboot/src/extensions/memory-dreem.ts` `grounding()` — must honor `scope`/`maxChars` per contract S5

### builtin-provider
verdict:  ⚠️ PARTIAL
reason:   S1–S3, S5 are clearly met (scoped file ops, ref-based update/forget, `default-parity.test.ts` byte-for-byte check, consolidation routed via `provider.store` in `scheduler-dispatch.ts` + `consolidation-routing.test.ts`). S4's observable part holds — builtin declares `hotMemory` and tests pass — but its parenthetical "existing hot-memory extension restructured under the provider" is not done: `hot-memory.ts` still writes `hot-memory.md` directly (`distillSession` → `writeFileSync`, line ~285), only gated by the `isReebootHotMemoryEnabled` flag. The brief's "hot-memory folded under the provider as builtin's implementation" is unmet for the write path.
focus:    `reeboot/src/extensions/hot-memory.ts` — storage/distill path remains outside the provider contract

### capability-registry-trust
verdict:  ✅ SATISFIED
reason:   All six requirements are implemented and tested: uniform walk in `registerCapabilityTools` (S1), `namespaceCapability` → `memory::dreem::graph` form (S2), `isValidCapabilityDef` rejection (S3), injection-scanner block (S4), uniform `minAuthLevel`/trust-enforcer gating via `ree-adapter.ts` + `trust-enforcer.ts` (S5), and non-builtin tools declared via `declareExternalSourceTool` into `effectiveExternalSourceTools` (S6) — covered by `trust-boundary.test.ts`, `capability-registry.test.ts`, `external-content.test.ts`, all passing.

### dreem-provider
verdict:  ⚠️ PARTIAL
reason:   S1–S4, S6–S7 hold: recall delegates to `/search`, ops map to knowledge endpoints with concept-path refs, `selfConsolidating` gates reeboot's job (`consolidation-routing.test.ts`), hot-retrieval declaration suppresses reeboot hot-memory, graceful degradation tested, and the `dreem` discriminated-union branch in `config.ts` validates `baseUrl`/`apiKey`/`consolidationInterval`/`llm`. Two gaps: S5's "using reeboot's view system for non-tool-schema surfaces" has no evidence anywhere (no `ToolView` usage in `memory-dreem.ts` or its tests), and `grounding()` ignores `scope`/`maxChars` (see contract S5).
focus:    `reeboot/src/extensions/memory-dreem.ts` — view-system surfaces absent; grounding ignores scope/maxChars

### memory-manager
verdict:  ✅ SATISFIED
reason:   `MemoryManager` in `src/memory-provider.ts` defaults to builtin, selects configured providers via the factory registry, falls back with a logged warning (`manager.test.ts` "logs a warning when an unregistered provider falls back"), holds exactly one active provider, and dispatches only refs+scope (`manager.test.ts` S5 test). `before_agent_start` grounding and the `memory` tool route through `manager.active` in `memory-manager.ts`.

## Triage

✅ Safe to skip:   capability-registry-trust, memory-manager
⚠️  Worth a look:
- **memory-provider-contract** — dreem `grounding()` ignores `maxChars`/`scope` (contract S5 "within maxChars")
- **builtin-provider** — hot-memory write path not folded under the provider (direct `hot-memory.md` writes remain; brief Impact + S4 parenthetical)
- **dreem-provider** — "reeboot's view system for non-tool-schema surfaces" (S5) not evidenced; grounding opts ignored
❓  Human call:    none

Non-contract observations: full suite is green (296 files / 1910 tests; baseline was 283/1856) and the coverage gate passes (81.68/75.98/83/81.68 vs thresholds 80/72/80/80) — one flake in `tests/agent-runner/pi-runner-isolation.test.ts` appeared only under coverage instrumentation (500 ms timing race, unrelated to memory files); worth a rerun if it recurs.

---

## Evaluation — 2026-08-04 20:50

### memory-provider-contract
verdict:  ✅ SATISFIED
reason:   All six spec points are present in `reeboot/src/memory-provider.ts`: `MEMORY_SCOPES = ['self','human','both']` threads every op (S1); single `store(scope, content, opts?)` with `source: 'entry'|'session'|'consolidation'` (S1b); `recall(scope, query, limit?): Promise<MemoryHit[]>` — query-based, no full-dump API (S3); opaque `MemoryRef { readonly id }` consumed by `update`/`forget` (S4); `grounding(opts?: {scope?, maxChars?})` accepts no prompt/query input (S5); all six core operations are declared (S6). `tests/memory-plug/contract.test.ts` + `builtin-provider.test.ts` pass (69/69 suite green).

### builtin-provider
verdict:  ⚠️ PARTIAL
reason:   S1/S1b/S2/S4/S5 are clearly implemented and tested (hot-first `store`, session distillation, ref-based update/forget, `hotMemory` capability declaration, consolidation routing via `store('self', insight, {source:'consolidation'})`). But spec S3's literal mechanism is not honored: the `memory` tool's `add` action routes `{ source: 'consolidation' }` — a **direct cold write** to MEMORY.md — whereas the contract says "`memory add` writes hot (and is later consolidated to cold)" (`memory-manager.ts`, memory tool execute). Also, grounding emits **cold-then-hot** (`block = coldBlock + hotBlock`) where the contract says "hot-then-cold". Note: the same spec sentence also demands byte-for-byte parity with pre-change behavior, which the implementation *does* satisfy (`default-parity.test.ts`) — the spec is internally contradictory, and the implementation resolved it in favor of parity.
focus:    `reeboot/src/extensions/memory-manager.ts` — memory-tool `add` routing and `grounding()` block ordering; human should decide which reading of S3 governs (hot-first mechanism vs byte-for-byte parity)

### dreem-provider
verdict:  ✅ SATISFIED
reason:   `reeboot/src/extensions/memory-dreem.ts` delegates recall to the backend's `/search` (S1), maps store/update/forget/clear/recall to knowledge endpoints with opaque `refId` refs (S2), forwards raw transcripts unchanged for `source:'session'` (S2b), declares `selfConsolidating` — and `registerServerJobs` skips reeboot's job on that capability (`memory-manager.ts:729`, tested in `dreem-capabilities.test.ts`) (S3); declares `hotMemory` while reeboot's hot-memory is no longer a standalone extension (`loader.ts:301`) (S4); graph/health/tree/deep-search surface as namespaced tools with data-table views via reeboot's view system (S5); every op degrades at provider level with logged warnings (S6, tested unreachable-backend); `config.ts` has the dreem union branch with `baseUrl` required and `apiKey`/`consolidationInterval`/`llm` optional (S7). 8/8 dreem tests pass.

### capability-registry-trust
verdict:  ✅ SATISFIED
reason:   `registerCapabilityTools` walks `listCapabilities()` and registers one tool per capability uniformly for builtin/dreem/mem0 (S1); `namespaceCapability` yields `memory::dreem::graph` (S2); `isValidCapabilityDef` rejects malformed defs (S3); `scanInjection` blocks injecting descriptions (S4 — test log shows `capability 'evil' blocked`); `minAuthLevel` flows into `registerTool`, visibility-filtered in `ree-adapter.ts` and gated by the name-based `trust-enforcer.ts` `tool_call` hook (S5); non-builtin capability tools are declared via `declareExternalSourceTool` and consumed by injection-guard + pi-runner output scanning through `effectiveExternalSourceTools` (S6). All four trust-boundary and registry test files pass.

### memory-manager
verdict:  ⚠️ PARTIAL
reason:   S1–S4 and S6 are implemented and tested: builtin default, configured-provider selection, fallback-with-warning (`MemoryManager.select`), exactly-one-active provider, uniform capability registration. S5b is present in mechanism (`session_shutdown` + `reason === 'new'` → `manager.store('self', transcript, {source:'session'})`, manager does not distill — tested) but the contract says "assembles the **full** conversation transcript (from the messages log)" while the implementation truncates: `SELECT role, content, created_at FROM messages ORDER BY created_at DESC LIMIT 200` (`memory-manager.ts`).
focus:    `reeboot/src/extensions/memory-manager.ts` session_shutdown handler — `LIMIT 200` truncation vs the contract's "full conversation transcript"

## Triage

✅ Safe to skip:   memory-provider-contract, dreem-provider, capability-registry-trust
⚠️  Worth a look:  builtin-provider — S3's "memory add writes hot" and "hot-then-cold" grounding order not implemented (byte-parity clause satisfied; spec self-contradicts); memory-manager — S5b transcript capped at last 200 messages, contract says "full"

Context: full suite green (297 files / 1915 tests, baseline was 283/1856) and coverage gates pass (82.01% stmts / 75.74% branches / 83.25% funcs vs 80/72/80 required).

---

## Evaluation follow-up — 2026-08-04 21:15

Post-evaluation verification against `reespec/decisions.md`, the implementation, and git
history. Confirms/refines the two PARTIAL verdicts above.

### builtin-provider S3 — `memory add` → cold: CONFIRMED as a real divergence (not the consolidation exception)
The direct-to-cold write **is** a deliberate exception — but only for the
`source:'consolidation'` signal (contract S1b; decisions.md 2026-08-04 Option B entry;
docs/capabilities/memory.md row 3: "an insight produced by reeboot's consolidation
job → write directly to cold"). The implementation extends it beyond that scope: the
`memory` tool's `add` action routes `{ source: 'consolidation' }` → straight to
MEMORY.md (`reeboot/src/extensions/memory-manager.ts`, comment: "explicit 'remember
permanently' surface"), and `tests/memory-plug/default-parity.test.ts` codifies it
(asserts add lands byte-for-byte in MEMORY.md).

This contradicts the final decisions.md entry ("Everything is hot first — Option B",
2026-08-04): "the user's settled model is that the explicit memory tool and any write
land hot, and promotion to long-term is the consolidation job's decision... Option A
[tool add → cold] the user rejected as inconsistent. This supersedes the prior 'memory
add writes cold directly' byte-parity contract." The in-code comment is the only
justification for the deviation — no decision-log entry amends Option B.

Required action: route `memory add` through `store(scope, content, { source: 'entry' })`
(hot-first) and update `default-parity.test.ts` to assert the hot-first behaviour.

### builtin-provider S3 — grounding order: CONFIRMED as a real gap
Spec says "grounding surfaces hot + cold (same system-prompt block, hot-then-cold)";
implementation emits cold-then-hot (`block = coldBlock + hotBlock`,
`builtinMemoryProvider.grounding`). decisions.md contains no ordering decision either
way ("surfaces hot + cold"). No recorded rationale for the reversal.

Required action: reorder the builtin grounding digest to hot-then-cold (or obtain an
explicit decision amending the spec).

### memory-manager S5b — transcript `LIMIT 200`: CONFIRMED undocumented; REMOVE the cap
No rationale in decisions.md or design.md — the decision log says "assembles the
**full** conversation transcript". Git history shows the cap is an inherited idiom:
`hot-memory.ts` (commit 5c1b19f "feat: hot memory", pre-request) and the
consolidation-mining queries (`memory-manager.ts:521/525`) already use `LIMIT 200`;
the new `session_shutdown` handler (`memory-manager.ts:1373`) copied the pattern.

Owner ruling: **remove the cap.** Consolidation/session-distillation is a distillation
step — there is no reason to hard-cut the conversation before forwarding. Builtin
distillation truncates internally anyway (`text.slice(0, 4000)`), and for dreem (S2b)
the cap actively limits what the backend ingests, so the fix matters most on the
delegating path.

Required action: drop `LIMIT 200` from the session_shutdown transcript query in
`reeboot/src/extensions/memory-manager.ts` (forward the full messages-log transcript),
and update `tests/memory-plug/session-end.test.ts` accordingly.

## Triage (updated)

✅ Safe to skip:   memory-provider-contract, dreem-provider, capability-registry-trust
⚠️  Action items:  (1) memory add → hot-first per Option B decision + fix default-parity test; (2) grounding digest hot-then-cold; (3) remove LIMIT 200 transcript cap in session_shutdown handler

---

## Evaluation — 2026-08-04 21:32

### memory-provider-contract
verdict:  ✅ SATISFIED
reason:   `src/memory-provider.ts` defines `MemoryScope = 'self'|'human'|'both'` as a runtime const threading every op (S1); a single `store(scope, content, opts)` with `source: 'entry'|'session'|'consolidation'` (S1b); `recall(scope, query, limit?)` term-matching — never a full dump (S3); opaque `MemoryRef` with provider-owned translation (S4); `grounding({scope?, maxChars?})` accepting no prompt input (S5); all six core ops required on the interface (S6). `'both'` recall concatenates across namespaces in builtin (`memory-manager.ts:965-971`). `tests/memory-plug/contract.test.ts` (3 tests) passes.

### builtin-provider
verdict:  ✅ SATISFIED
reason:   `builtinMemoryProvider` (`memory-manager.ts:807+`) writes hot-first (`writeHotEntry`) for `entry`, LLM-distills `session` transcripts with a no-silent-drop fallback (`memory-manager.ts:816-854`), writes `consolidation` directly to cold (`:877-904`); `update`/`forget` address entries via opaque ref substring (`:942`); `recall` merges hot+cold (`:960-975`); `grounding` returns hot-then-cold trimmed to `maxChars` (`:984-1000`); declares `hotMemory` capability and NOT `selfConsolidating` (`:1003-1018`); reeboot's consolidation job routes through `provider.store('self', …, {source:'consolidation'})` (`applyOpViaProvider:399-427`). Tests: builtin-provider (11), hot-memory-cap (5), default-parity (2), consolidation-routing (3) — all pass.

### capability-registry-trust
verdict:  ✅ SATISFIED
reason:   `registerCapabilityTools` (`memory-manager.ts:1102+`) walks `manager.listCapabilities()` uniformly (S1), namespaces via `namespaceCapability` → `memory::<providerId>::<name>` (S2), rejects malformed defs via `isValidCapabilityDef` (S3), blocks injection patterns via `scanInjection` before registration (S4), propagates `minAuthLevel` (S5), and declares non-builtin provider tools as external sources for injection-guard's treat-as-data policy (S6). Tests: capability-registry (3), trust-boundary (4), external-content (2), dreem-capabilities (8) — all pass; live log shows `capability 'evil' blocked: injection pattern detected`.

### dreem-provider
verdict:  ✅ SATISFIED
reason:   `src/extensions/memory-dreem.ts` delegates `recall` to dreem's `/search` retrieval (S1), maps all core ops to knowledge HTTP endpoints with scope forwarded and opaque refs consumed (S2), forwards raw transcripts as `{transcript}` for dreem-side distillation (S2b), declares `selfConsolidating` (reeboot job skip verified by consolidation-routing.test.ts) and `hotMemory` (S3, S4), exposes graph/health/tree/deep-search as namespaced capabilities with data-table views (S5), degrades per-op with logged warnings on unreachable backend (S6 — tested at dreem-provider.test.ts:131), and config's discriminated union requires `baseUrl` (`config.ts:176`, `z.string().min(1)`) with optional `apiKey`/`consolidationInterval`/`llm` passed to the factory (S7). Tests: dreem-provider (8), config (4) — pass.

### memory-manager
verdict:  ✅ SATISFIED
reason:   `MemoryManager` (`memory-provider.ts`) defaults to builtin (S1), selects the configured provider (S2), falls back to builtin with a logged warning for unknown/unloadable providers (S3 — observed in test output), holds exactly one `activeProvider` (S4), and dispatches passing only opaque refs + scope tokens (S5). The `session_shutdown` handler (`memory-manager.ts:1364-1385`) assembles the full transcript from the messages log with no row cap and calls `store('self', transcript, {source:'session'})` without distilling (S5b — session-end.test.ts proves 250 rows forwarded uncapped); `listCapabilities()` returns exactly the active provider's declarations (S6). Tests: manager (5), session-end (2), provider-factory (4) — pass.

## Triage

✅ All capabilities satisfied — no action required.

(Full-suite discipline also held: 297 files / 1915 tests all green vs the brief's 283/1856 baseline; coverage 82.02/75.75/83.25/82.02 clears the 80/72/80/80 gate; `tsc --noEmit` clean.)

---
