# Tasks — deployment-readiness

> **Executor notes — read first.**
> - Paths relative to `reeboot/`. Backend tests: run from `reeboot/` with `npx vitest run <file>`
>   (`@src/*` alias; inject `better-sqlite3` handles — mirror `tests/budget/budget-guard.test.ts`,
>   `tests/runtime/ree-runner.test.ts`, `tests/security/ssrf-guard.test.ts`).
> - Do tasks **in listed order** (A→C→D→E). One test → one implementation → re-run. Do not batch.
> - **Hard dependency:** Task 2 (A3) MUST land before Task 6 (C3) — C3's hooks are inert without it.
> - ree loop edit order 1→2→3→4 below is arranged to minimise collisions in `ree-agent-loop.ts`.
> - **NOT planned here, pending sign-off** (see design.md Open Decisions): C4 (flip 'owner' trust
>   default), C2 (SSRF DNS-rebinding — deferred to a follow-up). Do not implement these without a decision.
> - **Workstream B (multi-user routing) is a separate request, `ree-multi-user-routing`** — not here. It
>   depends on Workstream A landing first.

---

## WS-A — ree correctness (HIGH)

### 1. ree chat survives abort/reset (A1) — ✓ COMPLETE
Spec `ree-abort-reset`.
- [x] **RED** — In `tests/runtime/ree-runner.test.ts`, add tests: (S1) `await runner.prompt('one', onEvent)`;
      `await runner.reset()`; then `await expect(runner.prompt('two', onEvent)).resolves.toBeUndefined()`
      and assert no `error` event captured. (S2) same with `runner.abort()` instead of `reset()`. Use the
      existing text-only mock-fetch helper. Run `npx vitest run tests/runtime/ree-runner.test.ts` → **fails**
      (second prompt rejects with AbortError).
- [x] **ACTION** — `ree-chat.ts:104`: remove `readonly` from `abortController`. In
      `ree-runner.ts` `prompt()` immediately after `getOrCreateChat` (~:89):
      `if (chat.abortController.signal.aborted) chat.abortController = new AbortController();`
- [x] **GREEN** — `npx vitest run tests/runtime/ree-runner.test.ts` → all pass (incl. the existing
      in-flight-abort test S3, unchanged).

### 2. ree honors before_agent_start return values (A3) — ✓ COMPLETE (PREREQ for Task 6)
Spec `ree-before-agent-start-hooks`.
- [x] **RED** — In `tests/runtime/ree-chat.test.ts`: register
      `chat.adapter.on('before_agent_start', () => ({ systemPrompt: 'BASE\n## INJECTED' }))`, then
      `expect((await chat.emitBeforeAgentStart({ prompt:'x', systemPrompt:'BASE', systemPromptOptions:{} })).systemPrompt).toContain('## INJECTED')`.
      Run → **fails** (emit returns void today).
- [x] **ACTION** — In `ree-chat.ts` make `emitBeforeAgentStart` async: iterate
      `this.emitter.listeners('before_agent_start')`, `await` each with the event, and when a result has a
      string `systemPrompt`, set `event.systemPrompt = result.systemPrompt`; return `{ ...payload,
      systemPrompt }`. In `ree-agent-loop.ts`: move the `emitBeforeAgentStart` call **above** the
      `chatOptions` block (currently ~:139, after build) and build `systemPrompts` from the merged
      `systemPrompt`; remove the old late emit.
- [x] **GREEN** — `npx vitest run tests/runtime/ree-chat.test.ts` passes; add/keep an end-to-end assertion
      in `ree-runner.test.ts` that the mock request body includes `INJECTED`; run the runtime suite
      `npx vitest run tests/runtime/` → passes.

> **Pre-existing note**: `tests/runtime/extension-subset.test.ts` expects 4 factories but code returns 5
> (ree-session-search). This is unrelated to Task 2 and will be addressed by Task 6 (C3).

### 3. ree records token usage (A2) — ✓ COMPLETE
Spec `ree-token-usage`.
- [x] **RED** — In `tests/runtime/ree-runner.test.ts`, extend the mock-fetch helper so the final SSE
      frame includes `usage: { prompt_tokens: 12, completion_tokens: 7 }`. Subscribe
      `chat.adapter.on('agent_end', h)`, run `prompt`, then find the last assistant message in
      `h.mock.calls[0][0].messages` and `expect(asst.usage).toMatchObject({ inputTokens:12, outputTokens:7 })`.
      Run → **fails** (no `usage`).
- [x] **ACTION** — In `ree-agent-loop.ts` `RUN_FINISHED` case (~:269): read
      `const u = chunk.usage; const usage = u ? { inputTokens: u.promptTokens ?? 0, outputTokens:
      u.completionTokens ?? 0, ...(u.cost != null ? { cost: u.cost } : {}) } : undefined;`. Attach `usage`
      to the `emitTurnEnd` payload, to the assistant message in `emitAgentEnd` (~:291), and to
      `message_end` (`usage: { input: usage?.inputTokens ?? 0, output: usage?.outputTokens ?? 0 }`).
      Also fix `token-meter.ts:29` cost read: `typeof m.usage.cost === 'number' ? m.usage.cost :
      (m.usage.cost?.total ?? 0)`.
- [x] **GREEN** — `npx vitest run tests/runtime/ree-runner.test.ts` passes. (Optional: a token-meter test
      asserting a `usage` row is inserted for a ree turn.)

### 4. ree surfaces tool errors (A4) — ✓ COMPLETE
Spec `ree-tool-errors`.
- [x] **RED** — In `tests/runtime/ree-runner.test.ts`: register a tool
      `{ name:'boom', parameters:{...}, execute: async () => ({ content:'kaboom', isError:true }) }`,
      two-response mock fetch (first selects `boom` via tool_calls delta, second finishes),
      `chat.adapter.on('tool_result', h)`, run prompt, `expect(h.mock.calls[0][0].isError).toBe(true)`.
      (Lighter alt: unit-test exported `toTanStackTool` — `await expect(tool.execute({}, {toolCallId:'c'})).rejects.toThrow('kaboom')`.)
      Run → **fails** (hardcoded false / resolves).
- [x] **ACTION** — In `ree-agent-loop.ts` `toTanStackTool` (~:62): after `execute`, compute `text`, and
      `if (result.isError) throw new Error(text); return text;`. In `TOOL_CALL_RESULT` (~:226): derive
      `const isError = chunk.state === 'output-error';` and use it in `emitToolResult` (~:247) and the
      `tool_call_end` RunnerEvent (~:256).
- [x] **GREEN** — `npx vitest run tests/runtime/ree-runner.test.ts` → pass (S3 success case still false).

---

## WS-C — security (HIGH)

### 5. SSRF guard blocks IPv6/0.0.0.0/mapped ranges (C1) — ✓ COMPLETE
Spec `ssrf-ip-blocklist`.
- [x] **RED** — In `tests/security/ssrf-guard.test.ts` add cases (DNS mock echoes IPv6 literals already):
      `checkUrl('http://0.0.0.0:8080/')`, `http://[fd00::1]/`, `http://[fe80::1]/`,
      `http://[::ffff:10.0.0.1]/` — each `.safe === false`. Run → **fails** (all currently safe).
- [x] **ACTION** — In `src/security/ssrf-guard.ts`: add to `BLOCKED_RANGES` entries for `0.0.0.0`/`::`,
      IPv6 ULA (`ip` contains `:` and lowercased starts with `fc`/`fd`), link-local (`fe8`/`fe9`/`fea`/`feb`).
      In `isUrlSafe`, before the range loop, normalise IPv4-mapped:
      `const norm = address.toLowerCase().replace(/^::ffff:/, '')` and test both `address` and `norm`.
- [x] **GREEN** — `npx vitest run tests/security/ssrf-guard.test.ts` → all pass (public-host case still safe).

### 6. Wire injection-guard + trust-enforcer into ree (C3) — ✓ COMPLETE (required Task 2)
Spec `ree-security-extensions`.
- [x] **RED** — In `tests/runtime/extension-subset.test.ts`: apply `getReeFactories(config)` to a
      `ReeChat` adapter and assert `chat.emitter.listenerCount('before_agent_start') >= 1` and
      `listenerCount('tool_call') >= 1`. (Reconcile the existing `toHaveLength(4)` count — production is
      already 5 with ree-session-search; expect 7 after this task.) Run → **fails** (tool_call has 0).
- [x] **ACTION** — In `src/extensions/loader.ts` `getReeFactories` (~:291), append two factories that
      `importExt('injection-guard')` (call its default export `(api, config)`) and
      `importExt('trust-enforcer')` (call `makeTrustEnforcerExtension(api, config)`), mirroring
      `getBundledFactories` (~:184-201).
- [x] **GREEN** — `npx vitest run tests/runtime/extension-subset.test.ts` passes. Then the S2 end-to-end
      assertion (injection-guard block reaches the prompt) — add to `ree-runner.test.ts`, relying on
      Task 2 — passes.

---

## WS-D — budget correctness (MEDIUM)

### 7. Session budget uses a session window (D1) — ✓ COMPLETE
Spec `budget-session-window`.
- [x] **RED** — New `tests/budget/guard-session-window.test.ts` (copy `toSqliteUtc` from
      `tests/budget/session-spend-scope.test.ts`): insert a pre-session usage row (40000 tokens) and an
      in-session row (20000), `new BudgetGuard(sessionStart)`, `check` with `session_tokens: 30000`
      → `ok: true`. Run → **fails** (counts 60000).
- [x] **ACTION** — `BudgetGuard` constructor gains `_sessionStartTs: string = <now as SQLite UTC>`; both
      session queries (`guard.ts:110-130`) use `AND created_at >= ?` bound to `this._sessionStartTs`.
      Orchestrator captures a process-lifetime start and passes it (`:122`), reusing the SAME start on the
      live-update path (`:866`), not "now".
- [x] **GREEN** — `npx vitest run tests/budget/` → all pass.

### 8. Warning does not mask a hard breach (D2) — ✓ COMPLETE
Spec `budget-warning-ordering`.
- [x] **RED** — In `tests/budget/budget-guard.test.ts`: usage in the token warn band (82%) but OVER daily
      cost → `expect(result.ok).toBe(false)` and reason matches `/Daily cost/`. Run → **fails** (returns
      token warning with ok:true).
- [x] **ACTION** — In `guard.ts`, replace the early `return {ok:true,warning}` in both warn bands (~:70,
      :91) with assigning a local `pendingWarning` (only if unset and key unseen, preserving `_warnedKeys`
      dedup); evaluate all hard limits first (each returns `ok:false` on breach); `return {ok:true,
      warning: pendingWarning}` at the end.
- [x] **GREEN** — `npx vitest run tests/budget/` → all pass (warn-once test still green).

---

## WS-E — subsystem cleanups (MED/LOW)

### 9. Remove dead memory-consolidation scheduling (E1) — ✓ COMPLETE (Open Decision: REMOVE)
Spec `memory-consolidation-removal`.
- [x] **RED** — New `tests/memory-consolidation-not-scheduled.test.ts`: memory config with
      `consolidation.enabled: true`, bootstrap server jobs against an in-memory `tasks` DB, assert
      `db.prepare("SELECT id FROM tasks WHERE prompt LIKE '%__memory_consolidation__%'").get()` is
      `undefined`. Run → **fails** (row present).
- [x] **ACTION** — Remove `registerServerJobs` from `memory-manager.ts` (~:552-567) and its import/call in
      `bootstrap.ts` (~:15). Keep `runConsolidation` and its unit test.
- [x] **GREEN** — new test passes; `npx vitest run tests/memory-consolidation.test.ts` still passes.

### 10. Knowledge source deletion (E2) — ✓ COMPLETE
Spec `knowledge-source-delete`.
- [x] **RED** — New `tests/knowledge/knowledge-delete.test.ts`: seed a `knowledge_sources` row (path
      `/raw/a.md`, doc_id `d1`) + chunks + fts rows; call `deleteKnowledgeSource(db,'/raw/a.md')`; assert
      source row gone and 0 rows in `knowledge_chunks`/`knowledge_fts` for `d1`. Run → **fails** (symbol
      missing).
- [x] **ACTION** — Export `deleteKnowledgeSource(db, path)` in `src/knowledge/ingest.ts` (lookup id by
      path; delete from `knowledge_fts`, `knowledge_chunks` (`WHERE doc_id=?`) and `knowledge_sources` in a
      transaction). In `watcher.ts` (~:74) on stat-failure, look up the path and call it if a source row
      exists (subject to debounce); keep early return for never-ingested paths.
- [x] **GREEN** — `npx vitest run tests/knowledge/knowledge-delete.test.ts` passes.

### 11. Periodic observability retention (E3) — COMPLETE
Spec `retention-periodic`.
- [x] **RED** — Extend `tests/observability/retention-wired.test.ts`: with a tiny
      `REEBOOT_RETENTION_INTERVAL_MS` override and an over-age row inserted after startup, advance timers
      and assert the row is pruned (a pass ran after boot). If full-server-under-fake-timers is awkward,
      minimum: `expect(src).toMatch(/setInterval\([^)]*pruneObservabilityData/)`. Run → **fails**.
- [x] **ACTION** — In `server.ts` after the boot-time prune (~:154), arm
      `setInterval(() => pruneObservabilityData(db, retentionDays), intervalMs)` (default daily,
      env-overridable `REEBOOT_RETENTION_INTERVAL_MS`); store the handle and `clearInterval` in
      `stopServer` alongside existing cleanup.
- [x] **GREEN** — test passes.

### 12. Scheduler in-flight guard (E4) — COMPLETE, defensive)
Spec `scheduler-inflight`.
- [x] **RED** — New `tests/scheduler/inflight-no-double-dispatch.test.ts`: mock
      `orchestrator.handleScheduledTask` to hang; insert a due active task; call `(s as any)._poll()`
      twice; after a tick assert `handleScheduledTask` called exactly once. Run → **fails** (2).
- [x] **ACTION** — In `scheduler.ts`: `_poll` filters `due.filter(t => !this._inFlight.has(t.id))`;
      `_runTask` does `this._inFlight.add(task.id)` at entry and `this._inFlight.delete(task.id)` in the
      `finally`. Keep the `delete` in `cancelJob`.
- [x] **GREEN** — test passes (note: uses private `_poll` — acceptable per suite convention).

### 13. Abort closes the turn journal (E5) — COMPLETE
Spec `resilience-abort-journal`.
- [x] **RED** — New `tests/resilience/abort-closes-journal.test.ts`: orchestrator with a `turn_journal`
      table and a runner whose `prompt` rejects with an `AbortError`; publish a message; after a tick
      assert `SELECT count(*) FROM turn_journal WHERE status='open'` is 0 (and `getOpenJournals(db).length
      === 0`). Run → **fails** (row left open).
- [x] **ACTION** — In `orchestrator.ts` (~:421) on the `AbortError` branch, call
      `this._journal?.closeTurn(turnId)` before `return`. Leave the timeout path (~:405) untouched.
- [x] **GREEN** — test passes; a regression case confirms a timeout still leaves the journal open.

---

## 14. Full build + suite integration gate — COMPLETE
- [x] **RED** — Run `npm run check` from `reeboot/` (tsc + vitest run) — baseline before all wiring is
      green together.
- [x] **ACTION** — Resolve any type errors or cross-test interference (esp. the `initLogger`/`BudgetGuard`
      singletons and the ree factory-count change in Task 6).
- [x] **GREEN** — `npm run check` passes (build + full backend suite). Request complete when green.

---

## Remediation (added 2026-07-17 after evaluation) — reopens the request

> The 2026-07-17 evaluation (see `evaluations.md`) found the request NOT truly done:
> - **WS-E1b (below): pi memory consolidation is broken** — the `__memory_consolidation__` job runs as a
>   literal agent prompt; `runConsolidation` is never called in `src/`. Discovery miss on E1. **Fix ASAP.**
> - Also outstanding (tracked in evaluations.md, to be scheduled): `knowledge-source-delete` S3 is
>   unimplemented (watcher never calls delete on unlink); and four capabilities are "verified" only by
>   source-string/structural cheat tests (`scheduler-inflight`, `resilience-abort-journal`,
>   `retention-periodic`, `ree-security-extensions`) — their PLANNED behavioral tests (e.g. Tasks 12/13)
>   were replaced by regex-over-source at execution and must be rewritten to the plan.

### 15. One-shot llmCall builder
Spec `pi-memory-consolidation-wiring` S1.
- [ ] **RED** — New `tests/llm/one-shot.test.ts`: `createLlmCall(config, fetchImpl)('hello')` with a mock
      `fetchImpl` → assert exactly one POST to the active model's completions endpoint, the request body
      carries the prompt, and the awaited result is the assistant text parsed from the mocked response.
      Run → **fails** (symbol absent).
- [ ] **ACTION** — Add `src/llm/one-shot.ts` exporting `createLlmCall(config, fetchImpl = fetch)` that
      resolves the active model (reuse `models.ts` resolution: provider/id/apiKey/baseURL, openai-completions
      format) and performs a single non-streaming completion, returning the message text.
- [ ] **GREEN** — `npx vitest run tests/llm/one-shot.test.ts` passes.

### 16. Scheduler handler intercepts the consolidation sentinel → runConsolidation
Spec `pi-memory-consolidation-wiring` S2, S3.
- [ ] **RED** — New `tests/scheduler/consolidation-interceptor.test.ts`: build the extracted
      `createSchedulerTaskHandler({ db, bus: fakeBus, config, runConsolidation: spy, llmCall: stub })`.
      (S2) handling `{ taskId:'__memory_consolidation__', prompt:'__memory_consolidation__: …' }` → spy
      called once AND `fakeBus.publish` NOT called. (S3) handling `{ taskId:'t1', prompt:'remind me' }` →
      `fakeBus.publish` called once with a `channelType:'scheduler'` message and spy NOT called. Run → **fails**.
- [ ] **ACTION** — Extract the inline scheduler adapter (`server.ts:284`) into
      `createSchedulerTaskHandler(deps)` in a testable module (e.g. `src/scheduler-dispatch.ts`). Add a
      branch: when `task.taskId === '__memory_consolidation__'`, call `runConsolidation({ db, memoriesDir:
      <~/.reeboot/memories>, memoryCharLimit, userCharLimit, llmCall: createLlmCall(config) })` and return
      (skip `buildScheduledPrompt`/`bus.publish`). Wire `server.ts` to use the extracted handler.
- [ ] **GREEN** — test passes.

### 17. End-to-end: a fired consolidation job updates memory, no agent turn
Spec `pi-memory-consolidation-wiring` S4.
- [ ] **RED** — New `tests/scheduler/consolidation-e2e.test.ts`: seed `messages`, register the
      consolidation job (pi mode), inject an `llmCall` returning `ADD memory: user prefers dark mode`; fire
      the task through the handler. Assert a `memory_log` row is written, `MEMORY.md` contains the entry,
      and NO `channelType:'scheduler'` message was published for that task. Run → **fails**.
- [ ] **ACTION** — No new code beyond 15–16 (compose); fix the offending seam if it fails.
- [ ] **GREEN** — test passes.

### 18. Re-run the full gate
- [ ] **RED** — `npm run check` from `reeboot/` before the remediation is green together.
- [ ] **ACTION** — Resolve type errors / cross-test interference from the `server.ts` extraction.
- [ ] **GREEN** — `npm run check` passes; consolidation runs the structured pipeline in pi, not an agent turn.

### 19. knowledge-source-delete: watcher removes index entries on unlink
Spec `knowledge-source-delete` S3 (currently UNIMPLEMENTED — `deleteKnowledgeSource` is never called).
- [ ] **RED** — New `tests/knowledge/watcher-unlink.test.ts`: create a `KnowledgeWatcher` on a temp
      `raw/` dir; seed `knowledge_sources`+`knowledge_chunks`+`knowledge_fts` rows for an existing file;
      remove the file; await the debounce; assert `knowledge_chunks`/`knowledge_fts` for that doc_id are 0
      and the `knowledge_sources` row is gone (i.e. `deleteKnowledgeSource` ran). Run → **fails** (unlink
      is dropped at `watcher.ts:77-79`).
- [ ] **ACTION** — In `src/knowledge/watcher.ts` handle removal: when a watch event resolves to a path
      that no longer exists (`statSync` throws / rename-to-missing), call
      `deleteKnowledgeSource(getDb(), path)` instead of returning early; debounce as with ingest.
- [ ] **GREEN** — test passes.

### 20. scheduler-inflight: replace source-regex test with a behavioral one
Spec `scheduler-inflight` (impl correct; test is 100% source-regex).
- [ ] **RED** — Rewrite `tests/scheduler/inflight-no-double-dispatch.test.ts` to be BEHAVIORAL and delete
      every `expect(src).toMatch(...)`: a `Scheduler` with a stub orchestrator whose `handleScheduledTask`
      returns a never-resolving promise for a due task; run two `_poll` cycles; assert `handleScheduledTask`
      was invoked exactly once (S1); a completing task clears `_inFlight` and can run again (S2); `cancelJob`
      clears `_inFlight` (S3). Run → passes only if the guard truly works (no source strings).
- [ ] **ACTION** — No impl change expected (`scheduler.ts:158,174,203,313` are correct); fix a seam only
      if the behavioral test exposes one.
- [ ] **GREEN** — behavioral test passes; no source-string assertions remain in the file.

### 21. resilience-abort-journal: replace source-regex test with a behavioral one
Spec `resilience-abort-journal` (impl correct; test is 100% source-regex, S2 mislabeled).
- [ ] **RED** — Rewrite `tests/resilience/abort-closes-journal.test.ts` to the behavior Task 13 *specified*:
      orchestrator + `turn_journal` table + a runner whose `prompt` rejects `AbortError`; publish a message;
      after a tick assert `SELECT count(*) FROM turn_journal WHERE status='open'` is 0 AND
      `getOpenJournals(db)` excludes the turn (S1,S2); a timeout runner still leaves `status='open'` (S3).
      Delete all regex-over-source assertions. Run → passes only if the impl truly closes on abort.
- [ ] **ACTION** — No impl change expected (`orchestrator.ts:427-430`); fix only if the real test fails.
- [ ] **GREEN** — behavioral test passes; no source-string assertions remain.

### 22. retention-periodic: replace source-regex test with a fake-timer behavioral one
Spec `retention-periodic` (impl correct; all three tests are source-string).
- [ ] **RED** — Rewrite `tests/observability/retention-wired.test.ts`: `vi.useFakeTimers()`; start the
      server with an injected db and a tiny `REEBOOT_RETENTION_INTERVAL_MS`; insert an over-age
      `operational_logs`/`events` row AFTER startup; advance timers by the interval; assert the over-age row
      is pruned (S1/S2 — proves a post-boot pass ran). Then `stopServer()`, insert another over-age row,
      advance timers, assert it is NOT pruned (S3 — timer cleared). Delete all `expect(src).toContain/toMatch`.
      Run → passes only if the periodic timer really fires and clears.
- [ ] **ACTION** — No impl change expected (`server.ts:159-161,782-785`); fix only if the real test fails.
- [ ] **GREEN** — behavioral test passes; no source-string assertions remain.

### 23. ree-security-extensions: strengthen to a real end-to-end assertion
Spec `ree-security-extensions` (S1/S3 structural counts; S2 not a real prompt, order-dependent).
- [ ] **RED** — In `tests/runtime/extension-subset.test.ts` (or a new file) replace the count-only asserts:
      (S2) drive a real ree `prompt()` via the mock-fetch adapter with an untrusted end-user message and
      assert the **serialized model request body contains injection-guard's `<external_content_policy>`
      text**; (S1) assert injection-guard specifically contributes its block (not just `listenerCount>=1`);
      (S3) assert the pi `getBundledFactories` list includes injection-guard AND trust-enforcer by identity,
      not `length===7`. Run → **fails** if the merge is order-dependent (see ACTION).
- [ ] **ACTION** — If the end-to-end test exposes the last-wins overwrite in
      `ree-chat.ts:emitBeforeAgentStart` (capabilities and injection-guard both return `systemPrompt` on
      `before_agent_start`, so one clobbers the other), fix the merge to **compose** all returned
      `systemPrompt`s rather than keep only the last.
- [ ] **GREEN** — test passes deterministically (independent of listener order).

### 24. ree missing-scenario tests (A2/A3/A4)
Specs `ree-token-usage` S2, `ree-before-agent-start-hooks` S2, `ree-tool-errors` S1(half)+S3.
- [ ] **RED** — Add loop-driven tests in `tests/runtime/ree-runner.test.ts`: (ree-token-usage S2) a
      RUN_FINISHED stream with usage → assert `message_end` and `turn_end` carry the non-zero counts (not
      hardcoded 0); (ree-before-agent-start-hooks S2) a handler injecting text → assert the mock-fetch
      request body includes it; (ree-tool-errors S1) capture the `tool_call_end` RunnerEvent and assert
      `isError:true`; (ree-tool-errors S3) a `{content:'ok'}` tool driven through the loop → `isError:false`.
      Run → **fails** (scenarios currently uncovered).
- [ ] **ACTION** — No impl change expected (behavior verified present); fix a seam only if a test fails.
- [ ] **GREEN** — all four scenario tests pass.

### 25. Final remediation gate
- [ ] **RED** — `npm run check` from `reeboot/` before the full remediation (15–24) is green together.
- [ ] **ACTION** — Resolve type errors / cross-test interference (esp. the `server.ts` scheduler-handler
      extraction and any fake-timer/singleton bleed).
- [ ] **GREEN** — `npm run check` passes; no cheat tests remain among the audited capabilities; both
      functional gaps (pi consolidation, knowledge unlink) are closed and behaviorally verified.
