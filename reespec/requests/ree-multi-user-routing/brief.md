# Brief — ree-multi-user-routing

## Why

The ree SDK was built to serve a single-company support/triage agent — **many mutually-private
end-customers in one process**. But the orchestrator can't actually do that today. Verified in code
(2026-07-17):

- Runners are a **static map built once at startup** from `listContexts(db)` (`server.ts:197-222`);
  `orchestrator.ts:278` does `_runners.get(contextId)` and replies "No runner found" if absent.
- The web WS handler `/ws/chat/:contextId` (`server.ts:625`) validates the path id against the
  `contexts` table then **discards it**; it mints a per-connection `nanoid` used only for reply routing
  and publishes messages with `peerId = <nanoid>` (`server.ts:710`).
- `_resolveContext` collapses any unmatched peer to `routing.default` → `'main'` (`orchestrator.ts:176`).
- `ReeAgentRunner` binds to ONE `chatId = context.id` (`ree-runner.ts:50`).

**Net effect: every web customer collapses into the single shared `ReeChat 'main'`** — one shared
history, no isolation. This was explicitly deferred during the `ree-sdk` request ("dynamic per-peer
routing … a separate follow-up") and parked in `reespec/roadmap.md`. This request is that follow-up.

Deployment is single-tenant (one process = one product; `decisions.md`, 2026-07-17), so isolation is
**per-CHAT privacy** — customer A must not see customer B — never per-tenant RLS. The good news:
`ReeRuntime` already hosts N chats keyed by `chatId` with LRU/TTL eviction, per-chat durable history
(`chat_messages`), and per-chat FTS `session_search`. The missing piece is making a **stable
per-customer conversation id become the `chatId`**, created dynamically.

Split out of `deployment-readiness` (workstream B) to be planned in detail, because it is a genuine
feature with design-heavy parts (dynamic runner lifecycle) — unlike the bug-fix workstreams there.

## What Changes

A single-company support deployment (ree mode, Web/API) can serve many customers concurrently, each an
isolated conversation with its own history and its own `session_search` scope, created on demand from a
client-supplied conversation id — with no pre-registered context and no cross-customer leakage.

## Goals

- A stable `conversationId` is the isolation axis on `IncomingMessage`; `peerId` remains the
  reply-routing token (per-connection). The two axes are explicit and orthogonal.
- The Web/API transport supplies `conversationId` (WS path segment for v1); it is validated and
  reserved ids are rejected.
- In ree mode the orchestrator resolves context to `conversationId` and **dynamically creates and
  reuses** a per-conversation `ReeAgentRunner` over the shared `ReeRuntime` (lazy, via a runner
  factory) — no static context required.
- Per-conversation serialization/queueing works automatically (orchestrator busy/queue is keyed by
  the resolved context = conversationId).
- ree turns do **not** write the shared `messages` table (durable history stays in per-chat
  `chat_messages`); this removes a cross-customer co-mingling surface.
- `session_search` in ree is scoped to the current chat (verified; locked against regression).
- Lazily-created runners and their per-context state are evicted on inactivity so the maps stay bounded.
- A canonical, minimal client-integration contract (conversation id + shared API-key auth) is
  documented for client systems to implement.

## Non-Goals

- Not per-tenant isolation / RLS / separate DBs (single-tenant; future multi-tenant is DB-per-tenant
  deploy topology, not code — `decisions.md`).
- Not per-end-customer authentication — the shared server token authenticates the client integration;
  per-customer privacy is enforced solely by `conversationId → chat` isolation.
- Not the ree correctness bugs, security wiring, budget, or subsystem cleanups — those stay in
  `deployment-readiness` (WS A/C/D/E).
- Not a stateless HTTP/POST API surface (WS is v1; HTTP is a later transport reusing the same
  orchestrator path).
- Not backpressure / concurrent-LLM-call caps / load testing — separate follow-up.
- Not profile-specific support tooling or prompts — separate profile requests.

## Impact

- Touches `channels/interface.ts` (add `conversationId`), `server.ts` (WS ingress + runner factory,
  drop the ree `getContextById` gate), `orchestrator.ts` (ree-aware `_resolveContext`, `_resolveRunner`
  + factory injection, `skipPersist` for ree, lazy-runner eviction, cancel plumbing), and reuses
  `ReeRuntime`/`ree-history`/`ree-session-search` unchanged.
- **Prerequisite:** the ree correctness fixes in `deployment-readiness` WS-A (esp. abort/reset and
  token metering) should land first — a multi-user ree deployment is only safe once each chat is
  individually sound.
- Establishes the read-back reuse point: the `web-api-readback` history endpoint will later key on
  `conversationId` for support deployments.
