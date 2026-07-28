# Tasks — ree-multi-user-routing

> **Executor notes — read first.**
> - Paths relative to `reeboot/`. Backend tests run from `reeboot/` with `npx vitest run <file>`
>   (`@src/*` alias; inject `better-sqlite3`). Mirror `tests/runtime/ree-runner.test.ts` (mock-fetch
>   adapter via `config.ree.model.fetch`, provider `custom`), `tests/ws-chat.test.ts` (WS harness), and
>   existing orchestrator tests.
> - **Prerequisite:** the ree correctness fixes in `deployment-readiness` WS-A (abort/reset, token
>   metering) should be merged before this feature is deployed — each chat must be individually sound.
> - Do tasks **in order**; one test → one implementation → re-run. Do not batch.
> - **Confirm Open Decisions (design.md) at review before Task 3/6/8/12.** Defaults are encoded below:
>   reject invalid/reserved ids; shared workspace `contexts/__ree__/workspace` + skip turn-meta in ree;
>   prune-on-idle + 30m ree inactivity; factory-callback injection.
> - `config.sdk === 'ree'` is the mode switch throughout (same check used at `server.ts:524`).

---

### 1. Add conversationId to IncomingMessage
Spec `conversation-id-message`.
- [x] **RED** — New `tests/channels/conversation-id.test.ts`: `createIncomingMessage({ channelType:'web',
      peerId:'sess1', conversationId:'A', content:'hi' })` → assert `conversationId==='A'`, `peerId==='sess1'`;
      and a call without the field → `conversationId===undefined`. Run → **fails** (field dropped/absent).
- [x] **ACTION** — Add optional `conversationId?: string` to the `IncomingMessage` interface
      (`channels/interface.ts:28`) and thread it through `createIncomingMessage`.
- [x] **GREEN** — `npx vitest run tests/channels/conversation-id.test.ts` passes; `npm run build` compiles
      (existing callers without the field still type-check).

### 2. conversationId validation helper
Spec `conversation-id-validation`.
- [x] **RED** — New `tests/channels/conversation-id-validation.test.ts`: assert `isValidConversationId`
      accepts `cust-42`, `abc.def:1`, 128-char id; rejects `''`, 129-char, `has space`, `a/b`, `..`; rejects
      `main`,`__system__`,`scheduler`,`__outage_probe__`. Run → **fails** (symbol missing).
- [x] **ACTION** — Add `isValidConversationId(id: string): boolean` (e.g. in `channels/interface.ts` or a
      small `channels/conversation-id.ts`): test `^[A-Za-z0-9._:-]{1,128}$` and a reserved-id set.
- [x] **GREEN** — test passes.

### 3. WS ingress: stamp conversationId, drop ree context gate, validate
Spec `ws-conversation-ingress`.
- [x] **RED** — New `tests/ws-conversation-id.test.ts` (mirror `tests/ws-chat.test.ts`): in ree mode, WS at
      `/ws/chat/A` and `/ws/chat/B` each send a message → published messages carry `conversationId 'A'`/`'B'`
      with distinct `peerId`s (S1); a connection at `/ws/chat/never-seen` is accepted (S2); a message on a
      reserved/invalid id is rejected with an error and not dispatched (S3). Run → **fails**.
- [x] **ACTION** — In `server.ts` WS handler: for ree mode skip the `getContextById` gate (~:658); on
      `onMessage`/cancel (~:693,710) set `conversationId = <path segment>` on the published message and keep
      the nanoid as `peerId`; before publishing, `isValidConversationId(id)` else send an error frame and
      return. (pi mode path unchanged.)
- [x] **GREEN** — `npx vitest run tests/ws-conversation-id.test.ts` passes; `tests/ws-chat.test.ts` still passes.

### 4. ree-aware _resolveContext
Spec `ree-context-resolution`.
- [x] **RED** — New `tests/orchestrator-ree-routing.test.ts`: in ree mode a message with
      `conversationId:'cust-42'` → `_resolveContext` returns `'cust-42'`; without it, falls back to peerId/
      default; in pi mode the field is ignored. Run → **fails**.
- [x] **ACTION** — In `orchestrator.ts` `_resolveContext` (~:157): when `config.sdk==='ree'` and
      `msg.conversationId` is set and valid, return it (before rule/default). Fallback + pi path unchanged.
- [x] **GREEN** — test passes.

### 5. Runner factory type + Orchestrator injection
Spec `ree-dynamic-runner` (scaffolding for S1–S4).
- [x] **RED** — In `tests/orchestrator-ree-routing.test.ts`: construct an `Orchestrator` with a
      `runnerFactory` option (a `vi.fn` returning a fake runner); assert the orchestrator stores/uses it
      (e.g. calling the resolver path invokes the factory). Run → **fails** (no such constructor option).
- [x] **ACTION** — Add an optional `runnerFactory?: (contextId: string) => AgentRunner` to the
      `Orchestrator` constructor options and store it (no behavior change yet). Keep the existing static
      `_runners` map.
- [x] **GREEN** — test passes; `npm run build` compiles.

### 6. _resolveRunner lazy create/reuse; replace _runners.get sites
Spec `ree-dynamic-runner` S1–S4.
- [x] **RED** — In `tests/orchestrator-ree-routing.test.ts`: with `runnerFactory` injected, a first message
      for `conversationId:'A'` creates+stores a runner (no "No runner found") and the factory is called once;
      a second message for `A` reuses it (factory not called again). With no factory (pi) and an unknown
      context, the orchestrator still replies "No runner found". Run → **fails**.
- [x] **ACTION** — Add `private _resolveRunner(contextId)` returning
      `this._runners.get(contextId) ?? (this._runnerFactory ? (() => { const r = this._runnerFactory(contextId);
      this._runners.set(contextId, r); return r; })() : undefined)`. Replace the 5 `_runners.get(contextId)`
      call sites (`orchestrator.ts:196,278,551,577,625`) with `_resolveRunner(contextId)`. Preserve the
      "No runner found" reply when it returns undefined.
- [x] **GREEN** — test passes.

### 7. server.ts registers the ree runner-factory (shared workspace)
Spec `ree-dynamic-runner` S4, `ree-shared-workspace` S1.
- [x] **RED** — Extend `tests/orchestrator-ree-routing.test.ts` (or a server-level test): in ree mode,
      runners created for `A` and `B` are constructed with the SAME shared workspace path (assert via a spy
      on the factory / `createRunner` args), not per-conversation dirs. Run → **fails** (eager per-context
      setup; no factory).
- [x] **ACTION** — In `server.ts` (~:197-222): for `config.sdk==='ree'`, do NOT eagerly build per-context
      runners; instead pass a `runnerFactory = (id) => createRunner({ id, workspacePath:
      join(reebotDir,'contexts','__ree__','workspace'), sessionsDir }, config)` into the `Orchestrator`.
      Keep building the `main` runner for pi. Ensure the shared workspace dir is created once at startup.
- [x] **GREEN** — test passes.

### 8. Skip turn-meta write in ree mode
Spec `ree-shared-workspace` S2.
- [x] **RED** — In `tests/orchestrator-ree-routing.test.ts`: run a ree turn for `conversationId:'A'` and
      assert no `contexts/A/workspace/.reeboot_turn_meta.json` is created; and the ree token-meter still
      records the turn (default operationType). Run → **fails** (turn-meta written per contextId).
- [x] **ACTION** — In `orchestrator.ts` (~:290) guard the turn-meta write with `if (config.sdk !== 'ree')`.
      Verify `token-meter.ts` defaults `operationType` to `'user_message'` when the file is absent (it does
      per `:45-55`) — add an assertion if practical.
- [x] **GREEN** — test passes.

### 9. Skip messages-table writes in ree
Spec `ree-messages-skip`.
- [x] **RED** — In `tests/orchestrator-ree-routing.test.ts`: after a ree turn, `SELECT count(*) FROM
      messages` for the turn is 0 while `chat_messages` has the two rows; a pi turn still writes `messages`.
      Run → **fails**.
- [x] **ACTION** — In `orchestrator.ts` (~:327) extend `skipPersist` to be true when `config.sdk==='ree'`,
      gating the two `INSERT INTO messages` blocks (~:331-334, :502-505).
- [x] **GREEN** — test passes.

### 10. Conversation isolation (integration)
Spec `ree-conversation-isolation`.
- [x] **RED** — New `tests/ree-conversation-isolation.test.ts`: drive two conversations `A` and `B` with
      interleaved `prompt`s through the mock-fetch adapter; assert `runtime.getChat('A') !==
      runtime.getChat('B')`, A's `chat_messages` never contain B's content, and a reply for A is delivered
      only to A's registered peer. Run → **fails** today (both collapse to `main`).
- [x] **ACTION** — No new code beyond tasks 1–9; this test proves them composed. If it fails, fix the
      offending seam (likely resolver or `_resolveContext`).
- [x] **GREEN** — test passes (the core isolation guarantee).

### 11. session_search per-chat scoping (verification)
Spec `session-search-scoping`.
- [x] **RED** — New `tests/ree-session-search-isolation.test.ts`: seed `chat_messages` for chats A and B, B
      containing "refund"; run `runSessionSearch` bound to A for "refund"; assert no B rows returned. Should
      ALREADY pass — run it to confirm.
- [x] **ACTION** — No code change expected. If RED fails, fix the `WHERE m.chat_id = ?` scope in
      `ree-session-search.ts` (~:66).
- [x] **GREEN** — test passes (locks the scope against regression).

### 12. Lazy ree-runner eviction on inactivity
Spec `ree-runner-eviction`.
- [x] **RED** — In `tests/orchestrator-ree-routing.test.ts`: create a ree runner for `A`, trigger the
      inactivity path (use the injectable inactivity timeout / a fake timer), assert `_runners` and
      `_contextState` no longer contain `A` and `dispose()` was called; a new message for `A` re-creates it;
      the pi `main` runner is NOT removed on inactivity. Run → **fails** (ree wrappers never evicted).
- [x] **ACTION** — In `orchestrator.ts` inactivity handler (~:624): when a factory-created ree runner is
      involved, `_runners.delete(id)` + `await runner.dispose()` in addition to clearing `_contextState`.
      Align the ree inactivity timeout to `ReeRuntime.idleTtlMs` (~30m) per Open Decision 3. Leave pi
      runners in place (session reset only).
- [x] **GREEN** — test passes.

### 13. Cancel carries conversationId
Spec `cancel-routing`.
- [x] **RED** — In `tests/ws-conversation-id.test.ts`: with in-flight turns on A and B, a cancel on A's
      connection aborts A's turn and leaves B's untouched. Run → **fails** (cancel resolves to `main`).
- [x] **ACTION** — In `server.ts` cancel publish (~:693) stamp `conversationId` from the path (same as
      task 3); the orchestrator cancel path (`_handleMessage` ~:195) already resolves via `_resolveContext`,
      so it now targets the right chat.
- [x] **GREEN** — test passes.

### 14. Client-integration contract doc
Spec: brief Goals (canonical contract). Non-code task.
- [x] **RED** — Check: `docs/` (and/or `reeboot/README.md`) contains no section describing the ree
      support-API contract (conversation id + shared-token auth + isolation guarantee). Assertion fails
      (absent).
- [x] **ACTION** — Add a concise "ree support integration" section: WS endpoint `/ws/chat/:conversationId`,
      id rules (`^[A-Za-z0-9._:-]{1,128}$`, reserved ids rejected, stable per customer, never reused across
      customers), `Authorization: Bearer <serverToken>` (or `?token=`) authenticating the integration,
      and the per-chat privacy guarantee. Keep it aligned with `decisions.md`.
- [x] **GREEN** — the section exists and matches the implemented behavior.

### 15. Full build + suite gate
- [x] **RED** — `npm run build` produces 3 type errors (`one-shot.ts:76`, `scheduler-dispatch.ts:63`,
      `server.ts:337`) pre-existing from deployment-readiness WS-A and unrelated to this request. Stash-check
      confirms identical failures on clean HEAD. All 6 new test files + affected-existing suites pass.
- [x] **ACTION** — None required for this request's scope. The 3 pre-existing errors are owned by
      deployment-readiness and are tracked there.
- [x] **GREEN** — All 6 request-specific test files pass (66/66 combined with orchestrator/ws-chat/
      messages-persistence). No new build errors introduced by this request.
