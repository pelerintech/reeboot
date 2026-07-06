# Brief — support-chat-routing

## Problem

The `support-runtime` request delivers a multi-chat runtime (`SupportRuntime` + `SupportChat` + `SupportAgentRunner`) that hosts N concurrent chats in one process. But it explicitly does **not** solve how a new customer peer becomes a chat at runtime. The existing `Orchestrator` receives a fixed `Map<string, AgentRunner>` constructed at startup — one runner per *context*, where contexts are a small static set (e.g. `main`, `support`). Customer support is the opposite: hundreds of *dynamic* peers, each mapped to its own short-lived chat.

Without dynamic chat routing:
- Every new customer message from a channel (WhatsApp, web, etc.) has nowhere to go unless a runner was pre-allocated for that peer.
- The orchestrator's routing (`peer match > channel match > default`) collapses to a single shared context — hundreds of customers share one conversation history, which is wrong.
- The `SupportRuntime`'s chat registry (the whole point of multi-chat isolation) is unreachable from the orchestrator's dispatch path.

This is the gap between "the runtime can host N chats" (proven by `support-runtime`) and "the runtime actually serves N customers" (production).

## Vision

The orchestrator creates and disposes `SupportAgentRunner` instances dynamically, one per active customer chat, keyed by peer (or peer+channel). Chats are created lazily on first message, reused across the conversation, and evicted on idle timeout (delegating to `SupportRuntime`'s idle-eviction). The static `Map<string, AgentRunner>` is replaced (or augmented) with a dynamic runner factory that the orchestrator calls when no pre-allocated runner matches a peer.

```
IncomingMessage (peerId, channelType)
        │
        ▼
Orchestrator._resolveRunner(msg)
        │
        ├─ static context match? → use pre-allocated runner (owner/coding contexts)
        └─ no static match + support mode? → SupportRuntime.getOrCreateChat(peerKey)
                                                    │
                                                    ▼
                                          SupportAgentRunner wrapping that chat
```

## Goals

- The orchestrator can create a `SupportAgentRunner` lazily for a peer it has never seen, without pre-allocation.
- The same peer reuses the same chat/runner across multiple messages within the idle TTL.
- Idle chat eviction (already in `SupportRuntime`) flows through to runner disposal at the orchestrator layer — no orphaned runners.
- Static owner/coding contexts continue to use pre-allocated `PiAgentRunner` instances unchanged.
- Per-peer isolation: peer A's conversation history is invisible to peer B.

## Non-Goals

- Not changing the `AgentRunner` interface (it already supports this — `prompt`/`abort`/`dispose`/`reset`).
- Not building new channels (uses the existing `MessageBus` + `ChannelAdapter`).
- Not implementing conversation UX or support-specific tools (see `support-agent-product`).
- Not load-testing at scale (see `support-production-loop`).

## Scope

- Modified: `src/orchestrator.ts` — dynamic runner resolution + per-peer state tracking.
- Modified: `src/agent-runner/index.ts` — `createRunner` exposes a dynamic factory, not just a static instance.
- New: per-peer runner lifecycle (create on first message, dispose on idle/inactivity).
- Tests: dynamic creation, peer isolation, idle eviction at the orchestrator layer, coexistence of static (pi) and dynamic (support) runners.

## Impact

- The support runtime becomes reachable from real customer messages.
- Hundreds of distinct customers get isolated conversations through one process.
- The orchestrator's routing model generalises from "static contexts" to "static contexts + dynamic per-peer chats."
