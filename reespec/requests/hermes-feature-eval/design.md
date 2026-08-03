# Design — hermes-feature-eval

Four independent capabilities, selected by comparing reeboot against Hermes Agent
(Nous Research) and filtering through reeboot's two use cases (light personal assistant;
multi-user agenting backend) and its design values (light core, graceful degradation,
single-tenant per-process config). Each is adapted to reeboot's own idioms — deliberately
NOT copied from Hermes.

---

## A — Pluggable memory backend (MemoryManager)

**Goal:** Let `memory.provider` select ONE active memory backend per deployment. The
internal backend (MEMORY.md/USER.md + hot-memory) is the default and the fallback.
Future backends (dreem, mem0, honcho) plug in without touching the agent core. The RAG
knowledge corpus is explicitly NOT part of this seam.

**Approach — a provider interface, not an MCP straight-through:**
Introduce a small `MemoryProvider` contract that abstracts the memory role:

```ts
interface MemoryProvider {
  readonly id: string;                      // 'builtin' | 'dreem' | 'mem0' | ...
  recall(): Promise<MemoEntry[]>;           // entries available to the agent
  store(entries: MemoEntry[]): Promise<void>;   // add/overwrite
  clear(): Promise<void>;
  buildSystemPromptContribution(): Promise<string>;  // what goes in the system prompt
}
```

A `MemoryManager` holds the selected provider and is the single point the existing
`memory` tool, `before_agent_start` injection, and session hooks talk to. The current
`memory-manager.ts` file-logic is refactored into the first provider (`builtin`),
preserving today's behavior byte-for-byte as the default.

**Selection & fallback (graceful degradation):**
- `memory.provider` is a **closed enum** `'builtin' | 'dreem' | 'mem0'`, default `'builtin'`. A closed enum is chosen over an open string for config safety (new backends require a deliberate schema change rather than silently accepting a typo). The two non-builtin values are accepted but their provider implementations are later work; only `builtin` is wired here (see below).
- The manager resolves the configured provider; if it is unset, unknown, or fails to
  load/construct at startup, it falls back to `builtin` (never leaves memory disabled
  silently and never crashes the agent — the same philosophy as jina→baseline and
  search→DuckDuckGo fallbacks).
- Exactly ONE backend active at a time (Hermes's one-provider rule, which keeps the
  agent light and avoids tool-schema bloat). Composition is out of scope for this request.

**Why not "ride the existing MCP path" for A:** the MCP path only normalizes MCP-shaped
backends (dreem). A file backend (builtin) and SDK backends (mem0) do not fit it. The
provider seam is the only uniform way to *swap* heterogeneous backends, which is the
stated requirement.

**Open design note for A (contract shape):** the `map` semantics differ between a flat
entry store (MEMORY.md) and a graph (dreem). This request delivers the interface +
`builtin` provider + the manager/fallback. The `dreem` provider itself is a SEPARATE
future request (it is external work and depends on dreem's actual surface). Here we only
prove the seam holds a second backend via a test fake.

---

## B — "Footprint ladder" discipline (docs only)

**Goal:** make reeboot's design intent visible so contributors place new capability on
the right rung. reeboot already embodies the ladder (extension factories, config-toggle
gating, graceful degradation); nothing documents it.

**Approach:** extend `reeboot/AGENTS.md` (currently only integration-test instructions)
with a **"Design Goal & Architecture"** section that:
- states the design goal (light core, capability at the edges, graceful degradation),
- explains reeboot's own capability-placement rungs, authored from reeboot's actual
  mechanisms: (1) extend existing code, (2) gated tool (config toggle / check_fn-style
  service gating like jina, knowledge, memory), (3) extension, (4) MCP server, (5) new
  core tool dead-last,
- references reeboot's real idioms (ExtensionAPI, pi/ree adapters, single-tenant,
  per-deployment config) rather than Hermes's wording.

**Explicitly NOT** transplanted from Hermes (no `HERMES_*`, no borrowed Ruby-ish rules) —
the principle is borrowed, the content is reeboot-native. The reeboot persona AGENTS.md
(pi persona) is untouched; this is the contributor-facing developer doc.

---

## C — Generic inbound webhook triggers

**Goal:** one generic primitive — a webhook subscription = a trusted inbound event → an
agent run — covering notify (A), act+deliver (A+B), and B-side workflow entry (B) as
configurations. Generalizes the existing `/a2a/invoke` seed into an open, HMAC-gated,
prompt-mapped subscription surface.

**Approach:**
```ts
// config.webhooks — array of subscriptions
{
  name: 'ticket-triage',          // → POST /webhook/ticket-triage
  secret: 'hmac-secret',          // HMAC-SHA256 over the raw body (X-Reeboot-Signature)
  map: 'json' | undefined,        // how POST body becomes context (default: JSON.stringify)
  prompt: 'Classify this ticket and propose a triage: {body}',
  deliver: { channel: 'web', peer: '...' } | undefined,  // deliver result → channel+peer
  enabled: true,
}
```
- On POST to `/webhook/:name` (Hono route): look up the subscription; if disabled/404 →
  404. Verify HMAC-SHA256 of the raw body using the subscription secret against the
  `X-Reeboot-Signature` header (constant-time compare) → 401 on mismatch.
- Build context from the body via `map` (default = JSON string), substitute into the
  prompt template.
- Run the agent (reuse the a2a runner pattern: fresh runner, timeout, text/interrupt
  callbacks). If `deliver` is set, the result is sent to the channel+peer (POSIX to the
  existing channel delivery path). If not set, the webhook returns the result synchronously
  (JSON `{ result }`) to the caller — the "API gateway / command" mode.
- B-side workflow entry (category 3) is a *configuration* of the same primitive: the
  prompt instructs the agent to start a specialized conversation/delegate (via existing
  delegate/a2a tooling). No extra core surface.

**Why HMAC rather than bearer "server key":** each subscription carries its own secret so
external senders are individually authenticatable and revocable — a generalized
improvement over the single shared a2a server key.

**Relationship to existing pieces:** the `map`+prompt+deliver surface is new; the runner,
channel delivery, scheduler, and a2a machinery are reused. Webhooks are a low-footprint
*edge* capability per the footprint ladder (B) — they *trigger* existing machinery rather
than living in the core.

---

## D — Auth-state tool gating (multi-user backend)

**Goal:** when a conversation authenticates, the agent's tool set expands to unlock
customer-data / business tools. ree mode only. Concrete anchor: a support chat starts
unauthenticated (baseline tools); the user authenticates; gated tools unlock.

**Why ree and not pi:** pi binds tools at session creation; the ree agent loop re-reads
`chat.tools` **fresh every turn** (`Array.from(reeChat.tools.values())` in
`ree-agent-loop.ts`). So mutation between turns is picked up naturally — the mechanism is
a filter/policy, not deep loop plumbing.

**Approach:**
- Add a per-chat **auth level** on `ReeChat` (e.g. `chat.authLevel: AuthLevel`, default
  `'anonymous'`), plus an ordered level enum (`anonymous < customer < admin` or similar).
- `ToolDefinition` gains an optional `minAuthLevel` field. Baseline tools omit it
  (available at `anonymous`); gated tools set a required level.
- In `ree-agent-loop.ts`, filter the tools passed to TanStack: include a tool only if
  `(tool.minAuthLevel ?? 'anonymous') <= chat.authLevel`.
- Provide a reeboot-owned way to change auth state mid-conversation: an extension method
  on the ree extension API (`setAuthState(chatId, level)`) and a small first-class tool /
  command (`auth_establish`) that the runtime or the agent can call when authentication
  succeeds. The exact trigger (external service, the agent, a slash-command) is
  configurable per deployment; the contract is that a gated tool becomes callable on the
  next turn after the auth level is raised.

**Scope of gating:** gating applies to reeboot-registered tools (including the `mcp`
proxy if configured with a min level). Full MCP-server-level OAuth is explicitly OUT of
scope (see MCP OAuth deferral).

---

## Shared risks / notes

- **A:** The interface's "weakest common denominator" tension (flat entries vs graph) —
  mitigated by delivering only `builtin` now and proving a second backend via test fake.
- **C:** HMAC secret handling must avoid logging secrets; constant-time comparison.
- **D:** Only ree mode; pi mode unchanged. Must not break the existing ~15+ ree tests that
  rely on `createChat` being synchronous (auth level is a plain field, not an async init).
- All capabilities preserve reeboot's graceful-degradation and light-core principles.

## Non-goals (this request)

- dreem/mem0 provider implementations (separate future work; A proves the seam only).
- MCP OAuth (separate future request + dedicated discovery).
- Hermes learning loop, voice, IDE/ACP, credential pool, execution environments, bundled
  skills/tools tail.
