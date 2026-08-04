# Memory

Reeboot's memory is pluggable through a single provider contract. Exactly one
provider is active at a time (default `builtin`, configured via `memory.provider`).

## One store action, everything-is-hot-first

There is **one** write action: `store(scope, content, opts?)`. The provider decides
internally how content is distilled and routed hot-vs-cold based on an explicit
`source` signal:

| `opts.source` | Meaning | Provider behaviour |
| --- | --- | --- |
| `'entry'` (default) | a finished memory entry | write **hot** (working memory); a candidate for later consolidation to cold |
| `'session'` | a raw conversation transcript | the **provider distills** — builtin LLM-distills to hot; a delegating provider (dreem) ingests the raw session into its own tooling |
| `'consolidation'` | an insight produced by reeboot's consolidation job | write directly to **cold** (long-term MEMORY.md / USER.md) |

The model is **"everything is hot and later consolidated."** A plain `store` lands
in hot memory; promotion to long-term memory is the consolidation job's decision.

## Provider contract

Every provider implements `store / update / forget / recall / clear / grounding`
over a `scope` of `'self' | 'human' | 'both'`, returns/consumes opaque `MemoryRef`s,
and `recall` is query-based (never a full dump). Providers also declare optional
capabilities via `listCapabilities()` surfaced as namespaced `memory::<id>::*` tools.

## Session end forwards the conversation to the provider

On `session_shutdown` (reason `'new'`) the manager assembles the full conversation
transcript from the messages log and forwards it via
`store(scope, transcript, { source: 'session' })`. The manager does **not** distill —
distillation is a provider job (builtin LLM-distills to hot; dreem ingests the raw
session and uses its own tooling).

## Consolidation ownership

- `builtin` is **not** self-consolidating: reeboot's `__memory_consolidation__` job
  mines the `messages` table and writes insights via
  `store('self', insight, { source: 'consolidation' })` — never direct file writes.
- A provider that declares `selfConsolidating` (e.g. dreem) skips reeboot's job; its
  own Dream loop owns consolidation.

## Adding a provider

1. Implement `MemoryProvider` against the contract.
2. Declare capabilities (including a `key` for manager-recognised standard ones like
   `selfConsolidating` / `hotMemory`).
3. Register a provider factory via `registerProvider(id, factory)`.
4. Validate a typed `providerConfig` branch in `memory` config.
5. Set `memory.provider` to select it.

## Swapping backends via config

```jsonc
{
  "memory": {
    "provider": "builtin",
    "providerConfig": {}
  }
}
```

```jsonc
{
  "memory": {
    "provider": "dreem",
    "providerConfig": { "baseUrl": "http://localhost:8080", "apiKey": "..." }
  }
}
```

The provider is fully swap-capable: `memory` tool, grounding injection, and core ops
all route through the active provider.
