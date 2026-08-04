---
title: "Memory Design"
description: "How reeboot memory works — the pluggable, action-shaped contract — and how to implement or swap a memory provider."
---

# Memory Design

Reeboot's memory is a **pluggable backend** behind a single, action-shaped contract.
Exactly **one provider is active per deployment** (`memory.provider`), and a provider
swap genuinely replaces the builtin memory experience — not just wraps it.

The builtin provider (flat `MEMORY.md`/`USER.md` files) is the default and the fallback.
A configured `dreem` backend (memory *system* with its own consolidation + retrieval)
can take over the entire memory experience.

---

## 1. The contract

`src/memory-provider.ts` defines the seam every provider honors. It's **action-shaped**,
not file-shaped: semantics (scope, recall, refs, grounding) are in the contract; the
provider owns the backend translation.

### Scope — a first-class axis

Every core operation takes a singular `scope`:

```ts
type MemoryScope = 'self' | 'human' | 'both';
```

- `self` = the agent's own notes (`MEMORY.md` for builtin).
- `human` = the owner profile (`USER.md` for builtin).
- `both` = composite — recall merges + ranks across both; never conflates the two.

### Opaque refs

`store`/`recall` return an opaque `MemoryRef` (`{ id: string }`); `update`/`forget`
consume it. The **manager never inspects ref internals** — the provider translates the
opaque handle to its native addressing (builtin: entry substring; dreem: concept path;
mem0: memory id).

### Query-based recall

`recall(scope, query, limit?)` returns a relevant subset of `MemoryHit[]` — never a
full dump. `'both'` returns a merged, ranked list.

### Provider-owned grounding

`grounding({ scope?, maxChars? })` returns a small, provider-chosen memory digest injected
at session start. It takes **no prompt** (there's nothing to prompt with at session start
— that's `recall`'s job mid-conversation). `maxChars` is a ceiling the provider
self-policies, typically fed by the budget/token subsystem.

### Capability registry

Every provider also declares optional capabilities:

```ts
interface CapabilityDef {
  name: string;          // namespaced: memory::<providerId>::<name>
  description: string;
  parameters: unknown;   // tool schema
  key?: string;          // standard, manager-recognised declaration
  execute?(params): unknown;
}
```

`listCapabilities()` returns these. The memory extension walks them and registers **one
namespaced tool per capability** (`memory::<provider>>::<name>`) through the **same**
mechanism — and the same trust gate — as first-party tools (schema validation, injection
scanning, `minAuthLevel`/permission-tier gating, namespacing). "A tool is a tool."

Two **standard, manager-recognised** capability keys:

| key | meaning |
|---|---|
| `selfConsolidating` | the backend runs its own consolidation loop (dreem's Dream) → reeboot **skips** its consolidation job; otherwise reeboot runs it through `provider.store`. |
| `hotMemory` | the backend self-serves hot/adaptive retrieval → reeboot does **not** run its own hot-memory wiring. builtin declares this too but relies on reeboot's layer. |

---

## 2. How the pieces fit

```
        config.memory.provider  ('builtin'|'dreem'|'mem0')
                 │
                 ▼
     MemoryManager  (selects ONE active provider,
                     routes ONLY via refs + scope,
                     hosts capability registry + trust gate)
        │              │              │
        ▼              ▼              ▼
   builtin          dreem         (mem0 / future)
   (files, own     (own retrieval +
    consolidation    consolidation,   ─ hosted by the same
    + reeboot hot-   self-served hot)    contract + registry
    memory layer)
```

Agent entry points remain the `memory` tool and `before_agent_start` grounding, both
routed through `MemoryManager.active`. Provider-declared capabilities surface as
additional namespaced tools.

**What stays reeboot-owned (never provider):** `session_search` + FTS5, the
conversation/compliance log (`messages`, `events`, `turn_journal`, `memory_log`), the RAG
knowledge corpus, `custom-compaction` (working memory), and the budget-manager that drives
the grounding ceiling.

---

## 3. Implementing a new provider

To add a provider (e.g. `mem0`):

### 3a. Implement `MemoryProvider`

Create `src/extensions/memory-<name>.ts` exporting a factory that returns a
`MemoryProvider` honoring the six core ops + `listCapabilities()`. Handle every op either
natively **or degrade it at the provider level** (logged, surfaced result, no startup
crash, no silently-lost memory).

```ts
export function makeMyProvider(config: MyProviderConfig): MemoryProvider {
  return {
    id: 'mem0',
    async store(scope, content) { /* backend write */ return { id }; },
    async update(scope, ref, content) { /* backend update */ },
    async forget(scope, ref) { /* backend delete */ },
    async recall(scope, query, limit) { /* backend search → hits */ },
    async clear(scope) { /* backend wipe */ },
    async grounding(opts) { /* backend digest within maxChars */ },
    listCapabilities() { return [ /* your capabilities */ ]; },
  };
}
```

### 3b. Declare capabilities

Declare any optional capabilities (graph, health, hot retrieval). Set `key` to
`STANDARD_CAPABILITIES.selfConsolidating` / `.hotMemory` when they apply so the registry
can route reeboot's consolidation job and hot-memory wiring correctly.

### 3c. Register a factory

Register a factory on the global provider-factory registry so the memory extension can
construct the provider from the typed `providerConfig`:

```ts
import { registerProvider } from './memory-manager.js';
registerProvider('mem0', (cfg) => makeMyProvider(cfg as MyProviderConfig));
```

### 3d. Type its `providerConfig`

Add a branch to the `memory` discriminated union in `src/config.ts` so `providerConfig`
is validated and typed per provider — a typo in a required field or an unknown provider is
rejected at parse.

---

## 4. Swapping the backend via config

Because the manager and extensions speak only refs + scope, switching backends is purely
a config change. The `memory` block is a **discriminated union on `provider`**:

```jsonc
// builtin (default when the block is omitted)
{ "memory": { "provider": "builtin", "providerConfig": { "memoryCharLimit": 2200 } } }

// dreem (required baseUrl)
{ "memory": {
    "provider": "dreem",
    "providerConfig": { "baseUrl": "http://localhost:8787" }
} }
```

### Worked example — builtin → dreem

1. Add the `memory` block with `provider: "dreem"` and a reachable `baseUrl`:

   ```jsonc
   { "memory": {
       "provider": "dreem",
       "providerConfig": {
         "baseUrl": "http://localhost:8787",
         "apiKey": "optional-bearer-token",
         "consolidationInterval": "0 * * * *",   // passed to dreem's Dream schedule
         "llm": {}                                // optional; inherits reeboot's model by default
       }
   } }
   ```

2. Validate that the config parses (a bad `baseUrl` or unknown provider is rejected).

3. Restart. The loader registers the dreem factory; `MemoryManager.select('dreem')`
   makes dreem the active provider. The `memory` tool, `before_agent_start` grounding,
   recall, and all core ops now route through dreem.

4. dreem declares `selfConsolidating` → reeboot's `__memory_consolidation__` job is
   skipped (dreem's Dream owns consolidation). dreem declares `hotMemory` → reeboot's own
   hot-memory wiring is bypassed (dreem self-serves retrieval). dreem-native tools
   (`memory::dreem::graph`, `memory::dreem::health`, …) appear via the registry.

5. To revert, remove the block or set `provider: "builtin"` — no code change required.

---

## Reeboot-owned subsystems (scope guard)

These stay reeboot-owned regardless of provider and are not part of this seam:
`session_search` + FTS5 over `messages`; the conversation/compliance log; the RAG
knowledge corpus (`src/knowledge/*`); `custom-compaction`; the budget-manager (drives the
grounding ceiling).
