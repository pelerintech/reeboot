# Design — ree-multi-user-routing

## Context

### Current flow (verified) and the exact gap

For a web message in ree mode:

1. WS connects at `/ws/chat/:contextId` (`server.ts:640`). The path id is validated against the
   `contexts` table (`server.ts:658` `getContextById`, closes `4004` if unknown) then **discarded**.
2. A per-connection `sessionId = nanoid()` is minted (`server.ts:666`), registered with
   `webAdapter.registerPeer(sessionId, …)` for reply routing.
3. `onMessage` publishes `createIncomingMessage({ channelType:'web', peerId: sessionId, … })`
   (`server.ts:710`) — **peerId is the connection nanoid, not the path id**.
4. `_resolveContext` (`orchestrator.ts:157`) finds no rule for the nanoid → returns `'main'` (`:176`).
5. `_runTurn` does `_runners.get('main')` (`:278`) → the one static `ReeAgentRunner`, `_chatId='main'`.

**Result: all web customers share `ReeChat 'main'`.** Two identity axes are conflated into `peerId`,
and the isolation axis (a stable per-customer id) is missing.

### What already exists and is reused unchanged

`ReeRuntime` (`ree-runtime.ts`): `getOrCreateChat(chatId)` hosts N chats with LRU + TTL + `maxChats`
eviction; per-chat durable history in `chat_messages` (`persistTurn`/`loadHistory`, pruned on idle
eviction); per-chat FTS `session_search` scoped by `chat_id` (`ree-session-search.ts:66`). The design
makes **`chatId == conversationId`** so all of this becomes per-customer for free.

## Approach

### Decision 1 — Dynamic chat creation: lazy per-conversation runner over the shared runtime

Keep `ReeAgentRunner` one-chat. Add an orchestrator **runner-resolver**: an unknown `contextId` in ree
mode lazily constructs `new ReeAgentRunner(sharedRuntime, {id: conversationId, …}, config)` and stores
it in `_runners`. Everything downstream keys off `_chatId = conversationId`.

Chosen over making `ReeAgentRunner` multi-chat (a `prompt(chatId, …)` signature) because:
- The orchestrator's concurrency model — `busy`/`queue`/inactivity in `_contextState`
  (`orchestrator.ts:99-107`, `_dispatch` :218) — is already keyed by `contextId`. With
  `contextId == conversationId`, each customer gets **independent serialization/queueing** with no
  change to the concurrency core. A multi-chat runner would force the busy-lock to serialize all
  customers or be reworked per `(runner,chatId)`.
- It touches **no shared interface** — `AgentRunner.prompt` (`interface.ts:21`, also implemented by
  `PiAgentRunner`) is unchanged.
- `ReeAgentRunner` is a thin wrapper (runtime ref + context + config + chatId); per-conversation
  instances are cheap, and the heavy N-chat hosting/eviction stays in `ReeRuntime`.

Seams: replace the 5 `_runners.get()` sites (`orchestrator.ts:196,278,551,577,625`) with
`_resolveRunner(contextId)`; inject a `runnerFactory` into the `Orchestrator` constructor; in
`server.ts:197-222` register the factory for ree instead of eagerly building per-context runners.

### Decision 2 — Conversation identity + auth (the client contract)

- Add `conversationId?: string` to `IncomingMessage` (`channels/interface.ts:28`) — the isolation axis.
  `peerId` stays the reply-routing token.
- **Web transport (v1):** the WS path segment IS the conversation id; stamp it onto every published
  message (`server.ts:710` and the cancel publish `:693`). Keep the nanoid as `peerId`.
- **`_resolveContext`:** in ree mode return `msg.conversationId` (fallback `peerId`, then default). pi
  mode ignores it.
- **Validation:** opaque but bounded — `^[A-Za-z0-9._:-]{1,128}$`; reject reserved ids (`main`,
  `__system__`, `scheduler`, `__outage_probe__`) so a client id cannot collide with internal contexts.
  **Recommendation: reject** invalid/reserved ids (clear contract) rather than silently namespace.
- **Drop the `getContextById` gate for ree** (`server.ts:658`) — dynamic ids are never in `contexts`.
- **Auth:** reuse the existing shared `serverToken` (bearer / `?token=`, `server.ts:99-103,647`). It
  authenticates the **client integration** (server-to-server), NOT the end-customer. Per-customer
  privacy comes solely from `conversationId → chat` isolation. The client is trusted to mint stable,
  non-colliding ids (same customer thread ⇒ same id; never reuse one customer's id for another).

### Decision 3 — ree-mode `messages`-table write rule: SKIP

No reader of `messages` exists in ree mode: `session_search` reads `chat_messages`
(`ree-session-search.ts:63`), consolidation is off (one SDK per process), and durable per-turn
persistence is already `ReeAgentRunner.persistTurn → ree-history` (`ree-runner.ts:122`). The current
writes co-mingle all customers under one context with no conversation scoping (`orchestrator.ts:331,
502`) — a latent leak. **Skip** them in ree by extending `skipPersist` (`orchestrator.ts:327`).
Rejected: separate-pruned-table / tag-with-chat_id — both duplicate `chat_messages`.

### Decision 4 — `session_search` scoping: per-chat (already implemented)

`ree-session-search.ts:66` filters `WHERE m.chat_id = ?` using `getCurrentChatId()` (the adapter's
bound `chatId`, `ree-adapter.ts:154`). With `chatId == conversationId` this is per-customer. **No code
change — verification test only**, to lock the scope against regression.

### Decision 5 — Shared workspace + turn-meta

All ree conversations share ONE workspace (the RAG corpus; customers have no private filesystem) — do
NOT create `contexts/<conversationId>/workspace` per customer. **Recommendation: dedicated
`contexts/__ree__/workspace`.** The turn-meta file (`orchestrator.ts:290`, written to
`contexts/<contextId>/workspace/.reeboot_turn_meta.json`) would otherwise create a dir per customer:
**recommendation — skip the turn-meta write in ree mode**; the ree token-meter defaults
`operationType` to `'user_message'` when the file is absent (verify), which is correct for support.

### Decision 6 — Eviction & history lifecycle

`ReeRuntime` is the **source of truth** for chat state and history; orchestrator runner wrappers are
disposable caches. On inactivity (`orchestrator.ts:624`), for factory-created ree runners:
`_runners.delete(id)` + `await runner.dispose()` and clear `_contextState`, so both maps stay bounded.
`ReeRuntime` independently evicts the underlying `ReeChat` (LRU/`sweepIdle`); a re-arriving customer is
re-created and resumes from `chat_messages` unless idle-pruned.

**Privacy posture (recommendation):** keep `ReeRuntime`'s prune-on-idle behavior (idle eviction deletes
durable history; explicit dispose preserves — `ree-runtime.ts:211`). For transactional customer chats,
prune-on-idle is the safer default. Reconcile timers: align orchestrator ree inactivity to
`ReeRuntime.idleTtlMs` (default 30m) rather than the 4h personal-assistant default, so wrapper and chat
evict together. (Confirm at review — Open Decision.)

## Testing strategy

Backend vitest, `@src/*`, injected `better-sqlite3`. Mirror `tests/runtime/ree-runner.test.ts`
(mock-fetch adapter), `tests/ws-chat.test.ts` (WS harness), and orchestrator tests. Key integration
proof: two conversations with interleaved turns produce distinct `runtime.getChat` instances, isolated
`chat_messages`, and correct per-connection reply routing. Unit-level: validation helper, resolver
create/reuse, `_resolveContext` ree branch, `skipPersist` in ree, session_search isolation, eviction.

## Risks

- **Dual-lifecycle drift** (orchestrator `_runners`/`_contextState` vs `ReeRuntime._chats`) — mitigated
  by making `ReeRuntime` authoritative and wrappers disposable.
- **`_contextState` growth** under high fan-out between sweeps — bounded by inactivity eviction; a hard
  cap / active sweep is a possible follow-up (Open Decision).
- **Reserved-id / validation** is security-relevant — wrong charset or missing reserved-id check lets a
  client id collide with `main`/system contexts. Locked by the validation task + policy sign-off.
- **Turn-meta skip** assumes ree token-meter tolerates an absent meta file — verify in the task.
- **Shared workspace** means all customers share tool CWD — acceptable (no per-customer FS), but tools
  that write files must not assume per-customer isolation (out of scope; document).

## Open decisions (sign-off before execution)

1. **conversationId validation** — confirm charset `^[A-Za-z0-9._:-]{1,128}$` and **reject** (vs
   namespace) reserved/invalid ids. (rec: reject)
2. **Shared ree workspace path** — `contexts/__ree__/workspace`? And **skip turn-meta in ree** (vs point
   it at the shared workspace)? (rec: dedicated dir + skip turn-meta)
3. **Eviction/privacy** — keep prune-on-idle for customer chats and align ree inactivity to the 30m
   runtime TTL (vs the 4h default)? (rec: prune-on-idle + 30m)
4. **`_contextState` growth cap** — needed now, or defer to a backpressure follow-up? (rec: defer)
5. **Runner-factory injection shape** — pass a `runnerFactory` callback to the `Orchestrator`
   constructor vs give it the `ReeRuntime`+config. (rec: factory callback — keeps pi path untouched)
