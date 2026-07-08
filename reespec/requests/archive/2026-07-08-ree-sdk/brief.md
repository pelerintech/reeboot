# Brief — ree-sdk

## Problem

Reeboot is an AI assistant product. Today it runs on exactly one SDK — pi (`@earendil-works/pi-coding-agent`), wrapped by `PiAgentRunner` and selected by the `createRunner` factory. Pi is a heavy coding-agent SDK: it spawns a full agent session per chat, ships a large transitive dependency tree, and is built around one fully-capable coding session per process. That model fits the owner's personal assistant but does not fit a growing set of deployment profiles that need to serve **many users in parallel** from a single process:

- **Customer support** — hundreds of short, concurrent, transactional chats.
- **Legal SaaS intake** — structured-data collection via conversation, ending in a handoff to an external workflow.
- **Future SME verticals** — the same shape: many users, transactional, domain-scoped.

The `support-*` briefs (`support-runtime`, `support-chat-routing`, `support-production-loop`, `support-db-abstraction`, `support-agent-product`) were an early attempt at this, but they were scoped too narrowly: they treated "support" as the thing, when support is just **profile #1** of a general lightweight multi-user SDK. They also assumed the multi-user runtime would coexist with pi owner contexts in one orchestrator — a model the discovery rejected (see `decisions.md`, "ree-sdk: one SDK per process").

Without a second, lightweight SDK adapter:

- Every multi-user deployment pays pi's per-chat process/session cost.
- The `ExtensionAPI` abstraction (proven by `sdk-pluggability` and `support-runtime`) has only one implementer in production — `PiExtensionAdapter`. A second adapter is what forces the abstraction to be real.
- Reeboot cannot be productized across multiple SME business cases — each deployment is locked to pi's single-session model.

## Vision

A general lightweight SDK adapter — **`ree`** — selected by config (`config.sdk = "ree"` or the existing `config.agent.runner` field extended), built on **TanStack AI** (`@tanstack/ai`, MIT). One reeboot process runs exactly one SDK: a pi instance serves the owner; a ree instance is purely a dynamic-chat host serving many users. The same reeboot harness (orchestrator, channels, trust, observability, scheduler, budget, knowledge) wraps both.

```
config: { "sdk": "pi" }            config: { "sdk": "ree" }
  ┌──────────────────────┐           ┌───────────────────────────────┐
  │ PiAgentRunner        │           │ ReeAgentRunner                │
  │  1 heavy pi session  │           │  1 ReeRuntime, N ReeChats     │
  │  owner's assistant   │           │  purely dynamic-chat host     │
  │  MEMORY.md consolid. │           │  NO consolidation            │
  │  pi SessionManager   │           │  ree-owned per-chat history  │
  └──────────────────────┘           └───────────────────────────────┘
          │                                      │
          └──────────── ExtensionAPI ────────────┘
                              │
                    17 extensions (unchanged)
```

`ree` is a **stateless-loop library adapter**: TanStack AI's `chat()` returns an `AsyncIterable<StreamChunk>` we consume directly on the server — we own the loop, the SDK owns no stateful runtime. Per-chat conversation history is persisted at the reeboot layer (not pi's `SessionManager`, not TanStack). The domain competence for ree deployments comes from the **RAG knowledge corpus** (the existing `domain-knowledge` subsystem, reused as-is per the lego principle) — not from consolidating customer conversations.

```
┌──────────────────────────────────────────────────────────────┐
│ ReeRuntime (one per process, shared singleton)               │
│  ├ TanStack AI model client config (shared)                  │
│  ├ extension factory list (loaded once)                      │
│  ├ chat registry: Map<chatId, ReeChat>                       │
│  └ idle eviction (LRU + TTL), maxChats bound                 │
│        │                                                     │
│        ├──────────┬──────────┐                               │
│        ▼          ▼          ▼                               │
│   ┌────────┐ ┌────────┐ ┌────────┐                            │
│   │ReeChat │ │ReeChat │ │ReeChat │  isolated per-chat state:  │
│   │  A     │ │  B     │ │  N     │  history, tools, emitter,  │
│   └───┬────┘ └───┬────┘ └───┬────┘  AbortController           │
│       └─────────┴─────────┘                                  │
│                 │                                            │
│       ┌─────────▼──────────┐                                 │
│       │ReeExtensionAdapter │  implements ExtensionAPI:       │
│       │ (per chat)         │  real unsubscribe, signal-based │
│       └─────────┬──────────┘  cancel, reeboot-shaped events   │
│                 │                                            │
│       ┌─────────▼──────────┐                                 │
│       │ TanStack AI chat() │  AsyncIterable<StreamChunk>     │
│       │  (we own the loop) │  tool calling, MCP, streaming   │
│       └────────────────────┘                                 │
└──────────────────────────────────────────────────────────────┘
```

## Goals

- A `ReeAgentRunner` implementing the existing `AgentRunner` interface (`prompt`/`abort`/`dispose`/`reset`), selected by `config.sdk = "ree"` (or `config.agent.runner = "ree"`) in the `createRunner` factory.
- A `ReeRuntime` hosting N concurrent `ReeChat`s in one process with isolated per-chat state, bounded history, idle eviction, and a chat-count limit.
- A `ReeExtensionAdapter` implementing reeboot's `ExtensionAPI` with **real listener removal** and **real signal-based cancellation** (the pi adapter's no-op unsubscribe is a documented pi limitation; ree MUST NOT inherit it).
- A support-relevant subset of the existing extensions (`observability`, `session-name`, `token-meter`, `capabilities`) running **unchanged** on the second adapter — proving the abstraction holds across two SDKs. If an extension file must change, that's evidence the abstraction leaked and the fix goes in the interface or adapter, never the extension.
- The agent loop built on **TanStack AI** (`@tanstack/ai` + provider adapters + `@tanstack/ai-mcp`): tool calling, MCP client, multi-provider (Anthropic/OpenAI/Google/Groq/Ollama via `openaiCompatible`), token streaming.
- Per-chat conversation-history persistence at the reeboot layer (NOT pi's `SessionManager`), restart-survivable, isolated per chat. Minimal v1 shape; the full messages-table write rule and `session_search` gating are tracked in `reespec/roadmap.md` as reeboot-layer follow-ups.
- The runtime emits reeboot-defined event shapes (not TanStack-shaped payloads) for all events it surfaces.
- Clear documentation of where the abstraction is genuine (pass-through) vs. where it transforms (the seam), validated against two adapters.
- Bounded, predictable memory per chat; no per-chat process spawn.

## Non-Goals

- Not rebuilding pi — pi remains the SDK for owner/coding sessions.
- Not porting all 17 extensions to ree — only the ree-relevant subset runs in ree mode.
- Not building profile-specific tools, system prompts, or channel integrations (support tools, legal-intake prompts) — those are separate **profile** requests built on top of `ree-sdk`.
- Not building dynamic per-peer routing at the orchestrator layer — `ReeAgentRunner` manages chats internally keyed by chatId; orchestrator routing changes are a separate follow-up. A ree instance uses a single trivial context mapping to the `ReeAgentRunner`.
- Not solving DB divergence / Postgres support — separate follow-up (the `support-db-abstraction` brief's `ExtensionDB` question). v1 uses the existing `better-sqlite3` singleton.
- Not solving production hardening that TanStack AI already provides natively (streaming, multi-provider) — those are subsumed by adopting TanStack. Backpressure (bounding concurrent LLM calls) and load testing are separate follow-ups.
- Not removing pi as a dependency — `sdk-pluggability` already handles coexistence via the adapter pattern.
- Not changing the `ExtensionAPI` interface or the `AgentRunner` interface unless the runtime forces it (then a separate request).
- Not implementing the messages-table write rule or `session_search` gating for ree mode — tracked in `reespec/roadmap.md` as reeboot-layer prerequisites for production.

## Impact

- The `ExtensionAPI` abstraction is validated by a second implementer in production — pass-through vs. transform seams become explicit.
- Multi-user deployments (support, legal SaaS, future SME verticals) run hundreds of chats per process without paying pi's per-session cost.
- Listener leaks are eliminated at scale (real unsubscribe enforced).
- Tool cancellation is honoured across many chats (signal threaded through).
- The same `domain-knowledge` RAG corpus serves both pi and ree deployments — lego-piece reuse across business cases.
- Future SDKs (beyond pi and ree) have a proven pattern to follow and a real second adapter to copy from.

## Scope

- 1 new file: `reeboot/src/extensions/ree-adapter.ts` — `ReeExtensionAdapter` implementing `ExtensionAPI`
- 1 new area: `reeboot/src/runtime/` — `ReeRuntime`, `ReeChat`, the TanStack-AI-backed agent loop
- 1 new file: `reeboot/src/agent-runner/ree-runner.ts` — `ReeAgentRunner`
- Modified: `reeboot/src/agent-runner/index.ts` — `createRunner` branches on `ree`
- Modified: `reeboot/src/extensions/loader.ts` — `getReeFactories(config)` returns the ree-relevant extension subset
- New: per-chat history persistence (minimal v1 — likely a `chats` / `chat_messages` table or an extension of `messages` with a `chat_id` key; exact shape in design)
- New: TanStack AI dependency (`@tanstack/ai`, `@tanstack/ai-openai`/`-anthropic`/etc., `@tanstack/ai-mcp`)
- Extension files: **no changes** — the subset runs unchanged through the second adapter
- Tests: adapter tests (real unsubscribe, real cancellation), runtime concurrency/isolation tests, TanStack-backed agent loop tests, extension-subset-unchanged git-diff assertion
