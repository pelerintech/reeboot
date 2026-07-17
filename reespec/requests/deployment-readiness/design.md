# Design — deployment-readiness

## Context

Single request covering five workstreams (per the human's decision to plan it whole). Goal: make
reeboot deployment-ready for both the personal assistant (pi) and the single-company support agent
(ree). Deployment is single-tenant, one process = one product (`decisions.md`, 2026-07-17). All fix
points below were verified in code by investigation on 2026-07-17.

Workstream **B (multi-user routing)** was split into its own request, **`ree-multi-user-routing`**;
it is not covered here. This request is **A (ree correctness) → C (security) → D (budget) →
E (cleanups)**, with one hard cross-workstream dependency:

```
A (ree correctness) ──┬─▶ A3 "honor before_agent_start returns" is a PREREQUISITE for
                      │    C3 (injection-guard/trust-enforcer become effective in ree).
                      │    Wiring the factories without A3 registers INERT hooks.
                      ▼
C (security) ─▶ D (budget) ─▶ E (cleanups)

(A is also a prerequisite for the split-out `ree-multi-user-routing` feature.)
```

Within A, edit order **1 → 3 → 2 → 4** to minimise collisions in `ree-agent-loop.ts` (bugs 2 and 4
both touch its `RUN_FINISHED`/`TOOL_CALL_RESULT` cases; bug 3 reorders its emit).

## Approach

### Workstream A — ree correctness (HIGH; ree unusable without)

- **A1 abort/reset wedge.** `ReeChat.abortController` is `readonly`, created once (`ree-chat.ts:104,140`),
  aborted in `reset()` (`:291`) and never recreated; the runner leaves the chat in the registry so the
  next `prompt()` reuses an aborted signal (`ree-agent-loop.ts:126,148,339`). **Fix:** drop `readonly`
  (`ree-chat.ts:104`) and, in `ReeAgentRunner.prompt()` right after `getOrCreateChat`
  (`ree-runner.ts:89`), recreate the controller when aborted:
  `if (chat.abortController.signal.aborted) chat.abortController = new AbortController();`
- **A2 token usage never recorded.** `emitAgentEnd`'s assistant message has no `usage`
  (`ree-agent-loop.ts:290`); `token-meter.ts:38` early-returns when both are 0, so the `usage` table is
  never written and `BudgetGuard` cannot enforce on ree. **Fix:** read `usage` from the `RUN_FINISHED`
  chunk (`chunk.usage.promptTokens/completionTokens`, verified present via the openai-compatible
  adapter) and thread it into `emitTurnEnd`, the `emitAgentEnd` assistant message, and `message_end`.
  Secondary: `token-meter.ts:29` reads `cost?.total` but `cost` is a number — fix cost mapping too.
- **A3 mutating hooks are no-ops.** ree emits via bare `EventEmitter` and discards handler returns
  (`ree-chat.ts` emit*, `ree-adapter.ts:117`), and the loop emits `before_agent_start` *after* it built
  the system prompt (`ree-agent-loop.ts:121-139`). **Fix:** make `emitBeforeAgentStart` collect listener
  return values (merge `{systemPrompt}`), and move the emit **before** `chatOptions` is built so the
  merged prompt is used. This is what makes C3 real (capabilities/injection-guard inject their block).
- **A4 tool errors swallowed.** `toTanStackTool` drops `result.isError` (`ree-agent-loop.ts:64`) and
  `TOOL_CALL_RESULT` hardcodes `isError:false` (`:248,:256`). **Fix:** in `toTanStackTool` `throw` when
  `result.isError` (TanStack marks the chunk `state:'output-error'`), and derive
  `isError = chunk.state === 'output-error'` in the result case.

### Workstream C — security (HIGH; internet-facing in support mode)

- **C1 SSRF IPv6/`0.0.0.0` blind spot.** `ssrf-guard.ts` `BLOCKED_RANGES` (:19-56) is IPv4-only; DNS
  uses `family:0` (:103). **Fix (clean):** add `0.0.0.0`/`::`, ULA `fc00::/7`, link-local `fe80::/10`,
  and normalise IPv4-mapped `::ffff:<v4>` before the IPv4 tests.
- **C3 wire ree security extensions.** `getReeFactories` (`loader.ts:291`) omits injection-guard,
  trust-enforcer, confirm-destructive. **Fix:** append injection-guard + trust-enforcer factories
  (signature-compatible `(api, config)`). **Dependency: only effective after A3.** Split into C3a
  (wire + factory-list test) and rely on A3 for enforcement; a follow-up assertion verifies the
  capabilities/injection block actually reaches the prompt.
- **C2 SSRF DNS-rebinding/TOCTOU — DEFERRED (design-heavy).** Real mitigation needs the guard to return
  the resolved IP and an undici `dispatcher` with a pinned `lookup`, plus a direct `undici` dependency.
  Recommend a **separate follow-up request**; tracked as an open decision, not planned here.
- **C4 'owner' trust default — OPEN DECISION (policy).** `trust.ts:51,56` fail *open* (missing/unset
  config → `owner`). Flipping to fail-closed (`end-user`) is one line each but breaks two existing
  `trust.test.ts` assertions and changes the single-owner UX. Needs sign-off (see Open Decisions).

### Workstream B — multi-user routing — SPLIT OUT

Moved to its own request, **`ree-multi-user-routing`** (brief + design + 11 specs + 15 tasks). It
depends on Workstream A landing first (each chat must be individually sound before hosting many). Not
covered by this request.

### Workstream D — budget correctness (MEDIUM)

- **D1 session≠daily.** Both session queries reuse `date('now','start of day')` (`guard.ts:110-130`).
  **Fix:** `BudgetGuard` gains a `sessionStartTs` constructor param (default = construction time), session
  queries filter `created_at >= ?`; orchestrator passes a process-lifetime start (reuse the same start on
  live-update at `:866`, not "now").
- **D2 warning masks breach.** The daily-token warn band returns early (`guard.ts:70`) before other hard
  checks. **Fix:** accumulate a `pendingWarning` and evaluate all hard limits first; return the warning
  only at the end. Preserve `_warnedKeys` dedup.

### Workstream E — subsystem cleanups (MED/LOW)

- **E1 memory consolidation dead code — OPEN DECISION (recommend REMOVE).** `__memory_consolidation__`
  sentinel (`memory-manager.ts:552`) is never intercepted; scheduler runs it as a literal prompt.
  Recommend removing `registerServerJobs` + its `bootstrap.ts:15` wiring (consolidation is off in ree;
  never wired in pi). Keep `runConsolidation` for a future pi-mode request. Alternative (wire it) is a
  larger pi-only surface, out of scope.
- **E2 knowledge deletes.** `watcher.ts:74` drops unlink events. **Fix:** export
  `deleteKnowledgeSource(db, path)` in `ingest.ts` (delete from `knowledge_fts`/`knowledge_chunks`/
  `knowledge_sources` in a transaction) and call it from the watcher on unlink.
- **E3 retention runs once.** `pruneObservabilityData` called once at boot (`server.ts:154`). **Fix:**
  arm a `setInterval` (daily default, env-overridable `REEBOOT_RETENTION_INTERVAL_MS`), cleared in
  `stopServer`.
- **E4 scheduler `_inFlight` dead set — LATENT (defensive).** `scheduler.ts:76` never added/checked;
  no active bug (poll is serial). **Fix:** add-on-run/check-on-poll/delete-in-finally as hardening.
- **E5 cancelled turns misclassified as crashes.** AbortError path returns without `closeTurn`
  (`orchestrator.ts:421`), leaving an open journal that recovery re-queues. **Fix (one line):**
  `this._journal?.closeTurn(turnId)` before the abort `return`.

## Testing strategy

Backend: vitest, `@src/*` alias, injected `better-sqlite3` (`:memory:` or tmp file). Mirror
`tests/budget/budget-guard.test.ts`, `tests/runtime/ree-runner.test.ts` (mock `fetch` via
`config.ree.model.fetch`, provider `custom`), `tests/security/ssrf-guard.test.ts` (DNS mock),
`tests/runtime/extension-subset.test.ts` (factory-list), `tests/turn-journal.test.ts`. Each task's RED
is a runnable test asserting behavior through public interfaces; details in `tasks.md`.

## Risks

- **A3 async emit ordering.** Making `emitBeforeAgentStart` async and moving it before `chatOptions` can
  affect other emit sites; keep the change local and re-run the ree runtime suite.
- **B dual-lifecycle drift.** Orchestrator wrapper eviction vs `ReeRuntime` chat eviction can diverge;
  the design makes `ReeRuntime` the source of truth for chat/history, wrappers are disposable caches.
- **B `_contextState` growth** under high customer fan-out between sweeps (open decision B5-ceiling).
- **C4 / E1** change behavior/contracts — gated behind sign-off.
- **D1 live-update** must reuse the original session start or session accounting resets on config change.

## Open decisions (require sign-off before execution)

1. **C4 — flip the 'owner' trust default to fail-closed (`end-user`)?** Recommend YES for support safety;
   note it changes single-owner pi UX (owner must set `trust:'owner'`/`trusted_senders`) and rewrites 2
   trust tests. If NO, keep as-is and rely on `owner_only` per deployment.
2. **C2 — defer DNS-rebinding TOCTOU to a separate follow-up?** Recommend YES (needs undici plumbing +
   dependency; not a clean RED/GREEN).
3. **E1 — remove dead memory-consolidation machinery (vs wire it)?** Recommend REMOVE.

(WS-B routing decisions — conversationId validation, shared workspace, eviction/privacy — now live in
the `ree-multi-user-routing` request's Open Decisions.)
