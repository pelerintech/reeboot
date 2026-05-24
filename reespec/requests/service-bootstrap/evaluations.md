## Evaluation — 2026-05-24 15:30

### bootstrap-server-jobs
verdict:  ⚠️ PARTIAL
reason:   Source `src/bootstrap.ts` exists with correct `bootstrapServerJobs(db, scheduler, config)` signature, and `server.ts` source integrates it. Tests pass (5/5). However, `dist/bootstrap.js` does not exist — the module was never compiled. `dist/server.js` contains no `bootstrapServerJobs` call. Background jobs won't register at runtime.
focus:    `dist/` — `bootstrap.js` is missing; `dist/server.js` lacks the bootstrap call. Run `tsc` or `npm run build`.

### knowledge-manager-injection
verdict:  ⚠️ PARTIAL
reason:   Source `src/extensions/knowledge-manager.ts` has no phantom `(pi as any).getConfig?.()` / `getDb?.()` / `getScheduler?.()` calls — all three removed. `makeKnowledgeExtension(pi, config, db)` accepts explicit args. `registerServerJobs()` is exported for bootstrap. Tests pass. However, `dist/extensions/loader.js` still uses the old pattern `mod.default(pi)` without passing `config` and `db` explicitly. The compiled code hasn't been rebuilt.
focus:    `dist/extensions/loader.js` — budget-manager and knowledge-manager loading still uses pre-refactor patterns. Rebuild needed.

### loader-context-injection
verdict:  ⚠️ PARTIAL
reason:   Source `getBundledFactories(context, config)` accepts `context: ContextConfig` as first argument, and `budget-manager` receives `workspacePath: context.workspacePath` (not `process.cwd()`). `createLoader()` passes `context` through. Tests pass (1/1). However, `dist/extensions/loader.js` has `getBundledFactories(config)` — no `context` parameter — and budget-manager is hardcoded to `process.cwd()`. Dist is stale.
focus:    `dist/extensions/loader.js` — `getBundledFactories` signature and budget-manager wiring are pre-refactor. Rebuild needed.

### memory-manager-fixes
verdict:  ⚠️ PARTIAL
reason:   Source `registerServerJobs()` exists (replacing old `session_start`-based registration). `makeMemoryExtension` has no `session_start` handler per spec. `session_search` uses ESM dynamic `import('../db/index.js')` — no `require()`. Graceful fallback `{ results: [], error: 'Database not available' }` on DB failure. Tests pass (4/4). Dist likely stale (same rebuild gap).
focus:    `dist/` — confirm `dist/extensions/memory-manager.js` reflects source changes after rebuild.

### scheduler-registry-deferred-queue
verdict:  ⚠️ PARTIAL
reason:   Source `scheduler-registry.ts` has `_pending` queue, `registerJob()` that defers before `setGlobalScheduler`, drain-in-order, no re-drain on second call. Tests pass (4/4). However, `dist/scheduler-registry.js` has NO deferred queue — no `_pending`, no `registerJob()` function, and `setGlobalScheduler` simply assigns without draining. Dist is stale.
focus:    `dist/scheduler-registry.js` — entire deferred queue logic is absent in compiled output. Rebuild needed.

### session-lifecycle
verdict:  ⚠️ PARTIAL
reason:   Source `pi-runner.ts` calls `session.bindExtensions({ shutdownHandler })` in `_getOrCreateSession`, emits `session_shutdown` with `reason: 'new'` on reset and `reason: 'quit'` on dispose, no emit when no session, and re-binds on new session after reset. Tests pass (5/5). However, `dist/agent-runner/pi-runner.js` contains none of this — no `bindExtensions`, no `emitSessionShutdownEvent`, no `shutdownHandler`. Dist is stale.
focus:    `dist/agent-runner/pi-runner.js` — session lifecycle hooks are absent in compiled output. Rebuild needed.

## Triage

⚠️  Worth a look:  **All 6 capabilities share one root cause — the `dist/` directory is stale.** Source code and tests are correct for every spec, but the compiled output that actually runs at `reeboot start` reflects pre-refactor code. `bootstrap.js` doesn't exist in dist at all. `scheduler-registry.js` has no deferred queue. `pi-runner.js` has no session lifecycle hooks. `loader.js` uses old signatures. A full `tsc` rebuild would resolve all 6.

---
## Evaluation — 2026-05-24 15:46

### bootstrap-server-jobs
verdict:  ✅ SATISFIED
reason:   `src/bootstrap.ts` exports `bootstrapServerJobs(db, scheduler, config)` as specified. `server.ts` calls it immediately after `setGlobalScheduler()` (lines 288–294). Memory/knowledge config gates, error isolation, `logger.info`/`logger.error` calls, and custom schedule propagation are all present. Idempotency is handled by `scheduler.registerJob()` checking for an existing row before inserting — preserving `next_run`. Tests in `tests/bootstrap.test.ts` cover enabled/disabled and error-isolation scenarios.

### knowledge-manager-injection
verdict:  ✅ SATISFIED
reason:   `makeKnowledgeExtension(pi, config, db, options)` receives `config` and `db` as explicit arguments. No `(pi as any).getConfig?.()`, `.getDb?.()`, or `.getScheduler?.()` calls exist in `src/extensions/knowledge-manager.ts`. `loadVecExtension(db)` and `runKnowledgeMigration(db)` are called when `db` is provided. All four tools (`knowledge_search`, `knowledge_ingest`, `knowledge_file`, `knowledge_lint`) are gated correctly. `registerServerJobs` gates on `knowledge.enabled && wiki.enabled`. Tests in `tests/extensions/knowledge-server-jobs.test.ts` pass.

### loader-context-injection
verdict:  ✅ SATISFIED
reason:   `getBundledFactories(context: ContextConfig, config: Config)` accepts `context` as first argument. Budget-manager factory passes `workspacePath: context.workspacePath` (not `process.cwd()`). Knowledge-manager factory calls `makeKnowledgeExtension(pi, config, db)` with `db` from `getDb()`. `tests/extensions/loader-context.test.ts` asserts `opts.workspacePath === '/test/workspace'` and `!== process.cwd()`.

### memory-manager-fixes
verdict:  ⚠️ PARTIAL
reason:   `registerServerJobs` is correctly implemented and `makeMemoryExtension` has no `session_start` handler for job registration. `session_search` uses ESM-compatible `await import('../db/index.js')`. However, the spec states "GIVEN emitSessionShutdownEvent throws … THEN the error is caught **and logged**" — the catch block in `reset()` and `dispose()` in `pi-runner.ts` is a bare `catch {}` with no log call. No test covers the emit-throws-but-_session-still-nulled scenario.
focus:    `src/agent-runner/pi-runner.ts` — reset/dispose catch blocks swallow errors silently with no log call; `tests/agent-runner/pi-runner-lifecycle.test.ts` — missing test for emit-throws scenario.

### scheduler-registry-deferred-queue
verdict:  ✅ SATISFIED
reason:   `src/scheduler-registry.ts` implements `_pending[]` queue and `_real` sentinel. All four spec scenarios are covered: jobs held before `setGlobalScheduler`, immediate forwarding after, ordered drain of multiple pending jobs, and no re-drain on second `setGlobalScheduler` call. All four tests in `tests/scheduler-registry-queue.test.ts` pass.

### session-lifecycle
verdict:  ⚠️ PARTIAL
reason:   `bindExtensions({ shutdownHandler })` is called in `_getOrCreateSession`; `session_shutdown` is emitted with `reason: 'new'` on reset and `reason: 'quit'` on dispose; no-session guard is present; `bindExtensions` is re-called on new session after reset. However: (1) the spec requires "error is caught **and logged**" when `emitSessionShutdownEvent` throws — the catch block is `catch { }` with no logger call; (2) no test verifies that `session_start` handlers registered by extensions are actually invoked after `bindExtensions` (the SDK does emit it internally, but no test covers handler invocation).
focus:    `src/agent-runner/pi-runner.ts` — reset/dispose catch blocks log nothing; `tests/agent-runner/pi-runner-lifecycle.test.ts` — missing tests for (a) session_start handler invocation, (b) emit-throws-_session-still-nulled scenario.

## Triage

✅ Safe to skip:   `bootstrap-server-jobs`, `knowledge-manager-injection`, `loader-context-injection`, `scheduler-registry-deferred-queue`

⚠️  Worth a look:
- `memory-manager-fixes` — spec requires "error is caught and logged" on shutdown emit failure; catch block is silent (`catch {}`).  No test for this path.
- `session-lifecycle` — same silent catch issue; additionally no test verifying `session_start` handlers are actually invoked post-`bindExtensions`.

---

## Evaluation — 2026-05-24 16:11

### bootstrap-server-jobs
verdict: ✅ SATISFIED
reason: `src/bootstrap.ts` exports `bootstrapServerJobs(db, scheduler, config)` and is called from `server.ts` after `setGlobalScheduler()`. Registered jobs write to the `tasks` table with `status='active'` and a computed `next_run` via `Scheduler.registerJob()`. Idempotency is handled by `SELECT id FROM tasks WHERE id = ?` guard. Error isolation via try/catch with `logger.error`. Custom schedule values are propagated. All 8 scenarios are covered by passing tests in `tests/bootstrap.test.ts`.

### knowledge-manager-injection
verdict: ✅ SATISFIED
reason: `makeKnowledgeExtension(pi, config, db?)` receives config and db as explicit arguments — no calls to phantom `(pi as any).getConfig?.()`, `getDb?.()`, or `getScheduler?.()` (verified by `tests/extensions/knowledge-injection.test.ts`). When `knowledge.enabled` is false returns immediately. When enabled registers `knowledge_search`/`knowledge_ingest`; when wiki enabled adds `knowledge_file`/`knowledge_lint`. `registerServerJobs` gates on `knowledge.enabled && wiki.enabled`. File watcher starts when db provided.

### loader-context-injection
verdict: ✅ SATISFIED
reason: `getBundledFactories(context, config)` accepts `ContextConfig` as first arg and passes `context.workspacePath` to `budget-manager` via `{ workspacePath: context.workspacePath, config }` (confirmed by `tests/extensions/loader-context.test.ts` — workspacePath is `/test/workspace`, not `process.cwd()`). `makeKnowledgeExtension(pi, config, db)` is called with explicit db from `getDb()` at factory execution time.

### memory-manager-fixes
verdict: ✅ SATISFIED
reason: `memory-manager.ts` exports `registerServerJobs()` that gates on `memory.enabled && consolidation.enabled` before calling `scheduler.registerJob({ id: '__memory_consolidation__', ... })`. No `session_start` handler is registered on `pi` in the extension factory (consolidation job moved from session lifecycle to server bootstrap). `session_search` uses ESM-compatible `await import('../db/index.js')` — no `require()`. The catch block in `reset()` and `dispose()` now calls `getLogger().error()` (not silent `catch {}`). Tests in `tests/extensions/session-search-esm.test.ts` confirm returning `{ results: [], error: 'Database not available' }` gracefully when DB unavailable. Test in `tests/agent-runner/pi-runner-lifecycle.test.ts` verifies error is logged and `_session` is nulled when emit throws.

### scheduler-registry-deferred-queue
verdict: ✅ SATISFIED
reason: `scheduler-registry.ts` maintains a `_pending` array; `registerJob()` pushes to it when `_real` is null, forwards directly otherwise. `setGlobalScheduler()` drains pending jobs into the real scheduler in registration order then empties the queue. Calling `setGlobalScheduler()` a second time does not re-drain already-delivered jobs. All 6 scenarios covered by 4 passing tests in `tests/scheduler-registry-queue.test.ts`.

### session-lifecycle
verdict: ✅ SATISFIED
reason: `PiAgentRunner._getOrCreateSession()` calls `session.bindExtensions({ shutdownHandler })` exactly once per session creation; `shutdownHandler` invokes `this.reset()`. `reset()` emits `session_shutdown` with `reason: 'new'`; `dispose()` emits with `reason: 'quit'`. When no session exists, `reset()` does not emit. If `emitSessionShutdownEvent` throws, `getLogger().error()` is called and `_session` is still nulled (verified by `tests/agent-runner/pi-runner-lifecycle.test.ts` — `logErrorSpy` asserts error was logged, `(runner as any)._session` asserts null). After reset, next prompt creates new session and calls `bindExtensions()` again. Test confirms `session_start` is emitted with `{ type: 'session_start', reason: 'new' }` via the bindExtensions mock simulating SDK behavior. All 7 scenarios pass.

## Triage

✅ All capabilities satisfied — no action required.

---
