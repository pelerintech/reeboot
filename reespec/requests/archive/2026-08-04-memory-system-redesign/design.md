# Design — memory system redesign

## Architecture overview

```
                        config.memory.provider  ('builtin'|'dreem'|'mem0')
                                  │
                                  ▼
┌─────────────────────  MemoryManager  ──────────────────────┐
│  selects ONE active provider  (builtin default + fallback) │
│  speaks ONLY in opaque refs + scope tokens                 │
│  hosts the capability registry + uniform trust gate        │
└────────────────────────────────────────────────────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
   builtin provider      dreem provider         (mem0 / future)
   (reference,           (memory SYSTEM —       (hosted by same
    flat files, own        delegates recall/      contract + registry)
    consolidation +        consolidation to
    hot retrieval)         the sidekick)

agent entry points:   `memory` tool  ·  before_agent_start grounding
                       · provider-declared capability tools (registered via registry)
```

One provider owns the **entire memory experience** per deployment (delegation model). A
provider that can't truly honor an operation implements/degrades it at the provider level
— never leaks upward.

## The contract (reshaped, action-shaped)

```ts
export type MemoryScope = 'self' | 'human' | 'both';

export interface MemoryRef {
  /** Opaque, backend-specific handle. Manager never inspects the shape. */
  readonly id: string;
}

export interface MemoryHit {
  ref: MemoryRef;
  scope: MemoryScope;
  content: string;
  score?: number;
}

export interface MemoryProvider {
  readonly id: string;

  // core — every provider honors these
  store(scope: MemoryScope, content: string): Promise<MemoryRef>;
  update(scope: MemoryScope, ref: MemoryRef, content: string): Promise<void>;
  forget(scope: MemoryScope, ref: MemoryRef): Promise<void>;
  recall(scope: MemoryScope, query: string, limit?: number): Promise<MemoryHit[]>;
  clear(scope: MemoryScope): Promise<void>;
  grounding(opts?: { scope?: MemoryScope; maxChars?: number }): Promise<string>;

  // optional capability surface — uniform registry
  listCapabilities(): CapabilityDef[];
}
```

Key semantics (locked in discovery):

- **`scope`** is a first-class singular axis `'self' | 'human' | 'both'` threading through
  every operation. The `self`/`human` distinction is existential (personal-assistant
  memory about the human is never conflated with other knowledge) and must survive in
  every backend. `'both'` = composite (recall merges + ranks across both).
- **`recall` is query-based** — never full-dump. `'both'` returns a merged, ranked result.
- **`ref` is opaque.** `store`/`recall` return handles; `update`/`forget` consume them.
  The provider owns the translation (file line/substring for builtin, concept path for
  dreem, `memory_id` for mem0). Nothing about file names/ids/urls leaks into the manager.
- **`grounding` is provider-owned content** (Option A) with a **budget-manager-owned
  ceiling** (C4): the provider decides WHAT the digest says; reeboot's budget/token
  subsystem decides HOW MUCH room memory gets. `maxChars` is a ceiling the provider
  self-policies, typically fed by the budget subsystem. Grounding takes **no prompt** —
  at session start there is nothing to prompt with; that's `recall`'s job mid-conversation.

## MemoryManager changes

- `select(id)` unchanged (closed enum, fallback to builtin + logged warning on
  unknown/unloadable).
- Gains the **capability registry** and the **uniform trust gate** (below).
- `active` remains the single routing point for the `memory` tool and `before_agent_start`.

## Capability registry + uniform trust (Option 1, locked)

```ts
export interface CapabilityDef {
  readonly name: string;          // namespaced: `memory::<providerId>::<name>`
  readonly description: string;
  readonly parameters: unknown;   // tool schema
}
```

Every provider declares optional capabilities (`listCapabilities()`). The memory
extension walks the active provider's capabilities and registers one tool each — **one
mechanism for builtin, dreem, mem0 alike.** The six core methods stay the bare minimum;
extras never pollute the core. One capability is a **standard, manager-recognised
declaration** — `selfConsolidating: boolean` — which gates reeboot's consolidation job
(see Consolidation).

**Trust boundary — a tool is a tool.** Provider-declared tools flow through the SAME
governance as first-party tools, deliberately, via four reusable plies:

1. **Schema validation** at registration — declared tool defs must match the tool-schema
   contract; malformed defs are rejected and never enter the tool list.
2. **Injection scanning** — declared descriptions/instructions run through
   `security/injection-scanner` (injection-guard L1) before registration; injectable
   declarations are blocked.
3. **Policy / gating** — provider tools pass through the same `trust-enforcer` whitelist
   and permission-tier / `minAuthLevel` gate as first-party tools, so a deployment's
   `permissions`/trust config governs them uniformly.
4. **Namespacing** — `memory::<providerId>::<tool>` for filterability, logging, audit
   attribution.

Richer, non-tool-schema surfaces (e.g. interactive views) reuse reeboot's existing view
system rather than inventing a provider-native channel.

## Consolidation — provider-owned, declared (resolved)

Consolidation encoding is **resolved** to a single standard, manager-recognised
capability declaration: `selfConsolidating: boolean` on the provider's capability
registry (available to every provider uniformly).

- Provider declares `selfConsolidating: true` (dreem → its Dream): reeboot's
  `__memory_consolidation__` job is **skipped** — the backend's own loop owns it (dreem's
  Dream, autonomous + scheduled, exceeds builtin's job: signal scanning, convergence
  guard, compression/merge, security scan, health dashboard).
- Provider declares `selfConsolidating: false` (builtin, mem0): reeboot runs its
  consolidation job **through the provider contract** — mining reeboot's own conversation
  log and writing distilled insights via `provider.store('self', insight)` — never
  direct file writes.

This resolves the earlier "routed-through vs provider-owned" question: provider-owned
when the backend self-consolidates; routed-through when it doesn't.

## Hot-memory — provider-owned, declared (B)

- builtin: reeboot's existing hot-memory extension is **builtin's** recall enhancement,
  restructured under the provider and declared as a capability.
- dreem: `recall` delegates to dreem's cached→hot→deep machinery (its library has
  `runQueryCached`/`hotLookup`); dreem declares its hot-retrieval capability (and note:
  today the dreem **server's** default chat path calls `streamChat` directly, so the
  hot/cached path must be enabled in the sidekick deployment as part of this work).
- reeboot's agent loop does not run its own hot-memory for a provider that self-serves
  retrieval.

## builtin rebuild (reference implementation)

The builtin provider is reshaped onto the new contract, preserving today's behavior:
- `store/update/forget` map to the existing MEMORY.md/USER.md entry logic, returning and
  consuming opaque refs (entry substring/line as ref).
- `recall(scope, query)` = flat read + simple term matching over the scope's file(s);
  `'both'` concatenates.
- `grounding` = the existing system-prompt memory block, trimmed to `maxChars`.
- `clear(scope)` = current whole-file wipe.
- Declares the hot-memory + non-self-consolidating consolidation capabilities.
- `memory` tool + `before_agent_start` injection behavior preserved byte-for-byte as the
  default.

## dreem provider

- **Delegation model**: dreem is a memory SYSTEM, not a store. `recall` asks dreem to
  answer/search from its knowledge graph (via the configured endpoints); store/update/
  forget map to knowledge writes; consolidation is dreem's Dream (self-consolidating →
  reeboot job skipped); hot retrieval is dreem's own layer.
- **Reach**: targets the configured dreem server/endpoint (HTTP/API; the MCP surface is
  available but the provider uses the domain API for the six core ops + capabilities).
- **Capabilities**: registers the core ops plus dreem-native extras (graph, health,
  tree/search) via the uniform registry.
- **Deployment / LLM config (resolved)**: the sidekick shares reeboot's LLM config via
  the provider. The dreem provider is constructed with access to reeboot's active model
  config and passes the model choice to the backend (in init/API requests) so dreem's
  Dream/hot generation uses the same LLM as reeboot. `providerConfig.llm` may override.
  The full sidekick container deployment/environment wiring remains deploy glue (see Open
  items), but the config-passing contract is defined here.
- Since dreem is our own project, the provider can be made fully compliant with the
  contract (no degraded paths expected), and dreem itself may be adapted to expose the
  needed endpoints layered onto its existing server.

## What stays reeboot-owned (never provider)

- `session_search` + FTS5 over `messages` — reeboot tool, always present.
- conversation/compliance log (`messages`, `events`, `turn_journal`, `memory_log`) —
  invariant, audit/observability.
- RAG knowledge corpus (`src/knowledge/*`, `knowledge-manager`) — separate subsystem.
- `custom-compaction` (working memory) — chat-runtime concern.
- `budget-manager` — manages memory size regardless of provider (drives grounding ceiling).

## Risks / open items

- **Hot-memory capability shape** — how the agent loop learns a provider self-serves
  retrieval vs needs reeboot's layer. Declared capability (like `selfConsolidating`);
  resolved in specs.
- **Hallucination / trust of provider recall** — provider-served answers are external
  content; injection-guard L2 (treat as data) applies to `recall` output surfaced to the
  agent.
- **Full dreem sidekick deployment** (container bring-up, env wiring) — deploy glue,
  deferred to a separate follow-up; this request defines the config-passing contract and
  the provider, which points at a configured endpoint.

## Configuration & provider construction (resolved)

The `memory` config block uses a clean, provider-agnostic shape with a **discriminated
union** on the `provider` key, so each provider's `providerConfig` is strongly typed and
holds exactly the keys that provider needs:

```jsonc
{
  "memory": {
    "enabled": true | false,
    "provider": "builtin" | "dreem" | "mem0",   // the discriminator
    "providerConfig": {
      // typed per provider — only the keys THAT provider needs, flattened
    }
  }
}
```

```ts
const MemoryConfigSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('builtin'),
    enabled: z.boolean().default(true),
    providerConfig: z.object({
      memoryCharLimit: z.number().int().default(2200),
      userCharLimit: z.number().int().default(1375),
      consolidation: z.object({
        enabled: z.boolean().default(true),
        schedule: z.string().default('0 2 * * *'),
      }).prefault(() => ({})),
    }).prefault(() => ({})),
  }),
  z.object({
    provider: z.literal('dreem'),
    enabled: z.boolean().default(true),
    providerConfig: z.object({
      baseUrl: z.string().min(1),          // sidekick endpoint (required)
      apiKey: z.string().optional(),      // optional bearer token
      consolidationInterval: z.string().optional(), // pass-through to backend Dream schedule
      llm: z.record(z.string(), z.unknown()).optional(), // inherited from reeboot by default
    }),
  }),
  z.object({
    provider: z.literal('mem0'),
    enabled: z.boolean().default(true),
    providerConfig: z.record(z.string(), z.unknown()).optional(), // future backend
  }),
]);
```

- `provider` is the **discriminator**; `providerConfig` is resolved to the right schema by
  the union. `zod` gives per-provider type safety + config validation at parse — a typo in
  `baseUrl`, an unknown `provider`, or a malformed per-provider config is rejected up front
  (consistent with the closed-enum "deliberate schema change" principle).
- Allow-config with just `{ "memory": { "provider": "builtin" } }` still validates
  (defaults fill `enabled` + builtin `providerConfig`); `provider + providerConfig` stay
  backward-compatible with today's flat builtin fields via defaults/prefault.
- **Passing to the provider**: the memory extension resolves a provider-factory registry
  (`registerProvider(id, factory)`); it calls the factory with the parsed, typed
  `providerConfig` for the selected provider, and the factory returns a constructed
  `MemoryProvider` handed to `MemoryManager`.
- **Passing further to the backend**: the provider translates its typed config into
  backend calls — the dreem provider builds its HTTP/client from `baseUrl`/`apiKey`, sends
  `consolidationInterval` to the sidekick's Dream schedule, and propagates `llm` (inherited
  from reeboot's active model config unless overridden) so the sidekick's Dream/hot
  generation shares reeboot's LLM; builtin reads its limits/consolidation from the bag.
- **Coverage gate**: the repo's `vitest.config.ts` enforces thresholds
  (statements/lines/functions ≥ 80, branches ≥ 72) via `npm run test:coverage`.
  New provider/registry code must be covered. Caveat: this sandbox cannot run the FULL
  suite green (pre-existing ~30 files fail on `~/.reeboot` EPERM + external-service
  suites) — so the coverage gate + full-suite green are verified in a proper environment;
  in restricted sandboxes, verify the touched-area suites (`tests/memory-plug/*`,
  `memory-config`, `memory-*`, `extensions/memory-*`, `extensions/hot-memory*`) + `tsc`.
- **Regression to full-suite green** — preserving the 283-file / 1856-test discipline
  while reshaping the contract and builtin; many existing `tests/memory-plug/*` and
  `memory-manager` tests will need reshaping alongside.
- reeboot uses **`file://` subpath imports** (`../memory-provider.js`) — TypeScript is
  ESM; new provider files must follow the same import convention and compile clean.
