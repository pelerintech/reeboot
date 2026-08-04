# Memory system redesign — pluggable, action-shaped memory with a real dreem provider

## The problem

reeboot has a pluggable-memory *seam* (`MemoryProvider` + `MemoryManager`, from
hermes-feature-eval) whose contract is **file-shaped**, not **memory-shaped**. The
interface is `add/replace/remove/read/clear` over flat `memory`/`user` blob targets —
an exact description of `MEMORY.md`/`USER.md`. This leaks the builtin file model into the
contract that *every* provider must honor, so it cannot genuinely host a heterogeneous
graph/SDK backend (dreem, mem0). The original design doc even flagged this ("weakest
common denominator tension: flat entries vs graph") and deferred it. This request closes
that gap.

## Goal

Make memory in reeboot **genuinely provider-agnostic**: exactly one provider is active per
deployment (builtin default + fallback), and a provider swap genuinely replaces the
builtin memory experience — not just wraps it.

Concretely:

1. **Reshape the `MemoryProvider` contract** into semantic, capability-shaped actions,
   with scope (`self`/`human`/`both`), query-based recall, opaque `ref` handles, and a
   provider-owned grounding digest.
2. **Rebuild the `builtin` provider** onto the new contract as the reference
   implementation, preserving today's behavior (most deployments run it).
3. **Introduce a uniform provider-declared capability registry** so every provider
   surfaces optional capabilities (hot-memory, graph, richer recall) through ONE
   mechanism, with a deliberate trust boundary — a tool is a tool, gated/validated
   identically to first-party tools.
4. **Create a complete `dreem` provider** that treats dreem as a memory *system* (its
   own consolidation + retrieval), not a store — delegating the memory experience to the
   backend, degrading gracefully at the provider level when a backend can't honor an
   operation.

## Non-goals

- Rework of reeboot-owned, non-provider memory subsystems: `session_search`, the
  conversation/compliance log (`messages`, `events`, `turn_journal`), the RAG knowledge
  corpus, `custom-compaction`, `memory_log`.
- A `mem0` provider (separate follow-up; the seam + capability registry must host it but
  is not built here).
- The dreem sidekick deployment topology / LLM-config sharing mechanism (deployment
  glue, planned but not implemented in this request; the provider targets a configured
  dreem endpoint).

## Impact

- `src/memory-provider.ts` — contract reshaped and expanded (registry, refs, scope).
- `src/extensions/memory-manager.ts` — builtin provider rebuilt onto the new contract;
  consolidation + hot-memory folded under the provider as builtin's implementation.
- New `src/extensions/memory-dreem` — the dreem provider + capability registration.
- `src/config.ts` — `memory` block becomes a **discriminated union** on `provider`
  (`builtin`|`dreem`|`mem0`) with a typed, per-provider `providerConfig` (builtin: limits +
  consolidation; dreem: `baseUrl`/`apiKey`/`consolidationInterval`/`llm`).
- The existing `memory` tool and `before_agent_start` injection remain the agent's entry
  points, routed through `MemoryManager.active`.
- Tests: reshape/extend `tests/memory-plug/*`, add dreem provider + capability-registry
  suites. Preserve the full-suite-green discipline (283 files / 1856 tests today) AND the
  existing vitest coverage gate (statements/lines/functions ≥ 80, branches ≥ 72) — the new
  provider/registry code must be covered so coverage does not regress.
