# Brief — hermes-feature-eval

## Problem

Nous Research's **Hermes Agent** was upgraded and well-received. It is a close category peer to reeboot (terminal/messaging personal agent, memory + skills + scheduled jobs + channels). We want to know what features/tooling Hermes has that reeboot is missing and could adapt — filtered strictly through OUR use cases and design values, NOT copied wholesale.

## Our use cases (the filter)

- **A** — a highly customizable but **light** personal assistant, few channels + few tools, done very well.
- **B** — a **multi-user agenting backend** for different specialized conversations / agentic tasks.

We are NOT pursuing Hermes's self-improving "learning loop" (different ultimate goal), and we do not need the bundled skills/tools tail. Scope is Hermes's internal architecture + special features.

## Evaluation scope (4 candidates)

**A — Pluggable memory backend (DECIDED)**
Memory becomes a `MemoryManager` provider seam (recall / store / update / clear / system-prompt contribution). ONE active backend per deployment via `memory.provider`; the internal reeboot backend (MEMORY.md/USER.md + hot-memory) is default + fallback. Supports many backends (dreem, mem0, honcho) without touching core. Borrows Hermes's structure, adapted to reeboot's per-deployment config + graceful-degradation idiom. RAG/knowledge corpus stays a separate subsystem — NOT part of this seam. (Logged to decisions.md 2026-08-02.)

**B — "Footprint ladder" discipline (DECIDED as docs)**
Not new tooling. reeboot already *embodies* the ladder (extension factories, config-toggle gating, graceful degradation). The gap: nothing *documents* reeboot's design goal + architecture for contributors so new capability is placed on the right rung (extend → gated tool → extension → MCP → core dead-last). Deliverable: extend reeboot's project guidelines (AGENTS.md — currently only integration-test instructions) with a design-goal + architecture section, authored from **reeboot's own design choices**, NOT Hermes's wording/rules. reeboot's persona AGENTS.md is left untouched.

**C — Generic inbound webhook triggers (DECIDED)**
One generic primitive: a webhook subscription = a trusted inbound event → an agent run.
```
subscription { path, HMAC secret, map (POST body → context),
               prompt, deliver (channel+peer, or back-end/spawn target) }
```
Event-agnostic `map` seam (NOT GitHub-specific like Hermes). Categories are configurations, not separate features:
  1. event→notify/summarize (A) · 2. event→act+deliver (A+B) · 3. event→start B-side workflow (B — e.g. payment→document-gen, ticket→triage).
Generalizes reeboot's existing a2a `/invoke` inbound seed into an open, HMAC-gated, prompt-mapped subscription surface. Low-footprint edge capability (feeds scheduler/orchestrator/a2a).

**D — Auth-state tool gating for the multi-user backend (DECIDED — MUST)**
When a conversation authenticates (e.g. a support chat starts unauthenticated, then the user logs in), the agent's tool set expands to unlock customer-data / business tools. ree mode is anchored: tools are already re-read from the per-chat registry every turn, so the mechanism is "a policy that gates/expands the tool set on auth-state change," not new loop plumbing. pi mode binds tools at session creation, so this is a ree / B-side capability. Concrete anchor: support chats unlocking customer tools after auth.

**MCP OAuth — DEFERRED to a SEPARATE request.** Connecting MCP servers that themselves require resource-owner OAuth is NOT part of this eval. It needs its own dedicated discovery (use cases, pros/cons, approach) and is tracked as a separate future request.

## Non-goals (from evaluation)

- Hermes's self-improving learning loop (different direction).
- Bundled skills/tools tail, voice mode, IDE/ACP adapter, credential pool / rotation (conflicts with single-tenant per-process), execution environments — for now.
- MCP OAuth — deferred to its own separate request + dedicated discovery.

## Follow-ups (tracked, not dangling)

- **Testing-strategy reassessment (new request wanted).** The full unit suite has ~30
  pre-existing failing files in this environment (server-boot suites hit `EPERM` writing
  to `~/.reeboot`; external-service suites need WhatsApp/MCP/knowledge-watcher subprocesses;
  `package.test.ts` runs `npm pack`; a stale `getReeFactories` assertion expects 7 but the
  loader returns 8). During execution we repeatedly hit a scenario where we could not be
  certain of system correctness/stability because unrelated suites were red. A dedicated
  request should re-evaluate the test strategy: how to keep server-boot/integration tests
  runnable and isolated in CI-like sandboxes, split fast-unit vs slow/integration, and keep
  the suite green and trustworthy.
- **dreem/mem0 memory providers** — build the real providers against the `MemoryProvider`
  seam created here (separate request; seam proven with a fake here).
- **MCP OAuth** — separate request + dedicated discovery (already deferred during planning).
