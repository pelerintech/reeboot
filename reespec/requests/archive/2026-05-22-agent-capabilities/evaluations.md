
## Evaluation — 2026-05-22 17:12

Evaluating request: **agent-capabilities**

### capabilities-discovery-extension
verdict:  ⚠️ PARTIAL
reason:   Spec CD-7 requires: "Empty tool list produces minimal block stating 'No additional tools registered." The implementation in `reeboot/src/extensions/capabilities.ts:buildCapabilitiesBlock` uses "No additional tools registered." (period), not the exact quoted text "No additional tools registered" (no period) — but implementation is present and functional. More critically, spec CD-6 requires `sourceBreakdown` counts per source category; the implementation in `capabilities.ts` has `sourceBreakdown: { bundled, user, mcp, skill }` but there is no test verifying the observability payload includes `sourceBreakdown`, and the test only checks `toolCount` and `toolNames`. CD-4 requires "a usage hint explaining when to call the tool" per tool; the implementation only has a single generic global hint "Use them proactively when they match the user's need." — no per-tool usage hint. CD-8 requires "the block notes `… and N more tools` for the remainder" and "the capabilities_injected event payload reflects the capped count"; the test verifies the block note but NOT the capped count in the event payload.
focus:    `reeboot/src/extensions/capabilities.ts` — verify per-tool usage hints (CD-4), event payload capped count (CD-8), sourceBreakdown completeness in tests (CD-6)

### memory-consolidation-race-fix
verdict:  ✅ SATISFIED
reason:   All scenarios MC-1 through MC-6 are satisfied. `memory-manager.ts:567-586` moves registration from extension load time to a `session_start` handler, avoiding the race where `globalScheduler` is still `noopScheduler`. The `_consolidationRegistered` guard prevents double-registration (MC-2). The handler is only registered when consolidation is enabled (MC-3) and memory is enabled (MC-4). The previous `globalScheduler.registerJob` at load time is removed (MC-5). `runConsolidation` remains independently callable (MC-6). All 5 race-condition tests pass (`tests/extensions/memory-consolidation-race.test.ts`).
focus:    (none — SATISFIED)

## Triage

✅ Safe to skip:   memory-consolidation-race-fix
⚠️  Worth a look:  capabilities-discovery-extension — missing per-tool usage hints (CD-4), event payload capped count not tested (CD-8), sourceBreakdown completeness untested (CD-6)
❓  Human call:    (none)

---
