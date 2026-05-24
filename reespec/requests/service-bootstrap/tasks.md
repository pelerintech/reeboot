# Tasks — service-bootstrap

Read: brief.md, design.md, all specs/ before executing any task.
Run tests from `reeboot/`: `npx vitest run <path>` or `npx vitest run` for full suite.

---

### 1. Scheduler registry deferred queue

- [x] **RED** — Write `tests/scheduler-registry-queue.test.ts`: import `registerJob` and `setGlobalScheduler` from `src/scheduler-registry.ts`. Assert that calling `registerJob({id:'j1',...})` before `setGlobalScheduler()` does NOT call a spy's `registerJob`. Then call `setGlobalScheduler(spy)` and assert spy's `registerJob` was called once with `id:'j1'`. Add a second test: calling `registerJob` after `setGlobalScheduler` forwards immediately. Run `npx vitest run tests/scheduler-registry-queue.test.ts` → fails (no queue exists).

- [x] **ACTION** — In `src/scheduler-registry.ts`: add `_pending: JobDef[]` array and `registerJob(job)` export that pushes to `_pending` or forwards to `_real`. Update `setGlobalScheduler()` to set `_real`, drain `_pending` into it, and clear the array. Export the `JobDef` type inferred from `Scheduler.registerJob`'s parameter.

- [x] **GREEN** — Run `npx vitest run tests/scheduler-registry-queue.test.ts` → all tests pass.

---

### 2. Memory manager — move job registration to `registerServerJobs`

- [x] **RED** — Write `tests/extensions/memory-server-jobs.test.ts`: import `registerServerJobs` from `src/extensions/memory-manager.ts` (assert the named export exists — import will fail first). Then assert: calling it with `{ memory: { enabled: true, consolidation: { enabled: true, schedule: '0 2 * * *' } } }` calls `scheduler.registerJob` with `id: '__memory_consolidation__'`. Assert it does NOT call `registerJob` when consolidation is disabled. Run → fails (export does not exist).

- [x] **ACTION** — In `src/extensions/memory-manager.ts`: add `export function registerServerJobs(db, scheduler, config)` that conditionally calls `scheduler.registerJob({ id: '__memory_consolidation__', ... })`. Remove the `pi.on('session_start', ...)` handler from `makeMemoryExtension`. The `_consolidationRegistered` guard and `noopScheduler` import are no longer needed — remove them.

- [x] **GREEN** — Run `npx vitest run tests/extensions/memory-server-jobs.test.ts` → passes. Run `npx vitest run tests/extensions/memory-consolidation-race.test.ts` → update this test to match new behaviour (no `session_start` handler, `registerServerJobs` tested instead). Full suite still passes.

---

### 3. Memory manager — fix `session_search` ESM require() bug

- [x] **RED** — Write `tests/extensions/session-search-esm.test.ts`: mock `../db/index.js` to return a fake `getDb()` that returns an in-memory DB with the messages FTS table. Import `makeMemoryExtension`, register the extension, call the `session_search` tool's `execute()`. Assert it returns `{ results: [] }` without throwing. Then run it WITHOUT the mock and confirm no `ReferenceError` about `require` is thrown. Run → fails (require() throws in ESM context).

- [x] **ACTION** — In `src/extensions/memory-manager.ts`, in `session_search`'s `execute()`: replace `const { getDb } = require('../db/index.js')` with `const { getDb } = await import('../db/index.js')`. Unwrap the IIFE into a plain try/catch.

- [x] **GREEN** — Run `npx vitest run tests/extensions/session-search-esm.test.ts` → passes. Run `npx vitest run tests/extensions/memory-wiring.test.ts` → still passes.

---

### 4. Knowledge manager — explicit dependency injection

- [x] **RED** — Write `tests/extensions/knowledge-injection.test.ts`: import `makeKnowledgeExtension` from `src/extensions/knowledge-manager.ts` (it should accept `(pi, config)` — import will fail if signature is wrong). Create a mock pi that records `registerTool` calls. Call `makeKnowledgeExtension(mockPi, { knowledge: { enabled: true, ... } })` passing a real in-memory DB. Assert `knowledge_search` and `knowledge_ingest` are registered. Assert `(pi as any).getConfig` was never called (spy on it). Run → fails (current implementation calls `pi.getConfig?.()` and exits early).

- [x] **ACTION** — In `src/extensions/knowledge-manager.ts`: change `default export` to call `makeKnowledgeExtension(pi, {})`. Change `makeKnowledgeExtension` signature to `(pi: ExtensionAPI, config: Config, db?: Database)`. Remove all `(pi as any).getConfig?.()`, `(pi as any).getDb?.()`, `(pi as any).getScheduler?.()` calls. Config comes from the argument. DB comes from the argument (passed by loader) or falls back to `getDb()` if omitted. Move sqlite-vec load and knowledge migration into this function guarded by `if (db)`.

- [x] **GREEN** — Run `npx vitest run tests/extensions/knowledge-injection.test.ts` → passes. Run `npx vitest run tests/extensions/knowledge-manager.test.ts` → existing tests still pass (update mock pi if needed to remove `getConfig`/`getDb`/`getScheduler` methods).

---

### 5. Knowledge manager — `registerServerJobs` export

- [x] **RED** — Write `tests/extensions/knowledge-server-jobs.test.ts`: import `registerServerJobs` from `src/extensions/knowledge-manager.ts`. Assert: with `{ knowledge: { enabled: true, wiki: { enabled: true, lint: { schedule: '0 9 * * 1' } } } }`, calls `scheduler.registerJob` with `id: '__knowledge_lint__'` and schedule `'0 9 * * 1'`. Assert NOT called when `wiki.enabled: false`. Assert NOT called when `knowledge.enabled: false`. Run → fails (export does not exist).

- [x] **ACTION** — In `src/extensions/knowledge-manager.ts`: add `export function registerServerJobs(db, scheduler, config)` that conditionally calls `scheduler.registerJob({ id: '__knowledge_lint__', contextId: 'main', schedule: config.knowledge.wiki.lint.schedule, prompt: '...' })`.

- [x] **GREEN** — Run `npx vitest run tests/extensions/knowledge-server-jobs.test.ts` → passes.

---

### 6. `src/bootstrap.ts` — central server jobs bootstrap

- [x] **RED** — Write `tests/bootstrap.test.ts`: import `bootstrapServerJobs` from `src/bootstrap.ts` (assert the export exists — fails first). Create an in-memory DB with the tasks table migration applied. Call `bootstrapServerJobs(db, mockScheduler, config)` with `memory.enabled: true`, `memory.consolidation.enabled: true`. Assert a row exists in `tasks` with `id: '__memory_consolidation__'` and `status: 'active'`. Call again (idempotency) — assert still exactly one row. Run → fails (file does not exist).

- [x] **ACTION** — Create `src/bootstrap.ts`: export `bootstrapServerJobs(db, scheduler, config)`. Import `registerServerJobs as memoryServerJobs` from `./extensions/memory-manager.js` and `registerServerJobs as knowledgeServerJobs` from `./extensions/knowledge-manager.js`. Call each in a try/catch, logging info on success and error on failure via `getLogger()`.

- [x] **GREEN** — Run `npx vitest run tests/bootstrap.test.ts` → passes.

---

### 7. Loader — pass `context` into `getBundledFactories`

- [x] **RED** — Write `tests/extensions/loader-context.test.ts`: mock `budget-manager.ts` to capture the `workspacePath` argument. Call `createLoader({ id: 'main', workspacePath: '/test/workspace' }, config)` then call `loader.getExtensions()` (which triggers factories). Assert `makeBudgetManagerExtension` was called with `workspacePath: '/test/workspace'` and NOT `process.cwd()`. Run → fails (currently uses `process.cwd()`).

- [x] **ACTION** — In `src/extensions/loader.ts`: change `getBundledFactories(config)` to `getBundledFactories(context: ContextConfig, config: Config)`. Update `createLoader` to pass `context`. In the budget-manager factory closure, replace `process.cwd()` with `context.workspacePath`. In the knowledge-manager factory closure, pass `config` and the DB (via `getDb()` caught) explicitly to `makeKnowledgeExtension`.

- [x] **GREEN** — Run `npx vitest run tests/extensions/loader-context.test.ts` → passes. Run `npx vitest run tests/extensions/loader.test.ts` → existing loader tests still pass.

---

### 8. `pi-runner` — call `bindExtensions` after session creation

- [x] **RED** — Write `tests/agent-runner/pi-runner-lifecycle.test.ts`: mock `createAgentSession` to return a session mock with a `bindExtensions: vi.fn()` method. Create a `PiAgentRunner`, call `prompt('hi', () => {})`. After the promise settles, assert `session.bindExtensions` was called exactly once. Assert the call included a `shutdownHandler` function. Run → fails (`bindExtensions` is never called currently).

- [x] **ACTION** — In `src/agent-runner/pi-runner.ts`, inside `_getOrCreateSession()`, after `const { session } = await createAgentSession(sessionOpts)`: add `await session.bindExtensions({ shutdownHandler: () => { this.reset().catch(() => {}); } })`. Store `this._session = session` after the `bindExtensions` call.

- [x] **GREEN** — Run `npx vitest run tests/agent-runner/pi-runner-lifecycle.test.ts` → passes. Run `npx vitest run tests/agent-runner/` → existing runner tests still pass.

---

### 9. `pi-runner` — emit `session_shutdown` on reset and dispose

- [x] **RED** — Extend `tests/agent-runner/pi-runner-lifecycle.test.ts`: add a test that creates a session mock where `_extensionRunner` has a `hasHandlers: () => true` and `emit: vi.fn()`. Call `runner.reset()` after a session exists. Assert `emit` was called with `{ type: 'session_shutdown', reason: 'new' }`. Add a second test for `dispose()` asserting `reason: 'quit'`. Run → fails (neither reset nor dispose emit shutdown currently).

- [x] **ACTION** — In `src/agent-runner/pi-runner.ts`, import `emitSessionShutdownEvent` from `@earendil-works/pi-coding-agent`. In `reset()`: before nulling `_session`, if `_session` exists, call `emitSessionShutdownEvent((this._session as any)._extensionRunner, { type: 'session_shutdown', reason: 'new' })` wrapped in try/catch. In `dispose()`: same pattern with `reason: 'quit'`.

- [x] **GREEN** — Run `npx vitest run tests/agent-runner/pi-runner-lifecycle.test.ts` → all tests pass including the new shutdown assertions.

---

### 10. Wire `bootstrapServerJobs` into `server.ts`

- [x] **RED** — Write `tests/entrypoint-bootstrap.test.ts` (or extend `tests/entrypoint.test.ts`): mock the scheduler, capture `setGlobalScheduler` calls, mock `bootstrapServerJobs` from `src/bootstrap.ts` with a spy. Start the server with `memory.enabled: true`. Assert `bootstrapServerJobs` was called after `setGlobalScheduler` (verify call ordering by checking the spy was called). Run → fails (`bootstrapServerJobs` is not imported or called in `server.ts`).

- [x] **ACTION** — In `src/server.ts`, inside the scheduler init block, after `setGlobalScheduler(schedulerInstance)`: import and call `bootstrapServerJobs(db, schedulerInstance, appConfig)`. Wrap in the existing try/catch block.

- [x] **GREEN** — Run `npx vitest run tests/entrypoint-bootstrap.test.ts` → passes. Run `npx vitest run` → full suite passes.

---

### 11. Update decisions.md

- [x] **RED** — Check: `reespec/decisions.md` does not yet contain entries for "deferred job queue", "bindExtensions", or "registerServerJobs bootstrap pattern". Assertion: those strings are absent.

- [x] **ACTION** — Append four new decision entries to `reespec/decisions.md`:
  1. `registerJob() in scheduler-registry defers until real scheduler is set`
  2. `Background jobs declared via registerServerJobs(), bootstrapped in bootstrap.ts`
  3. `pi-runner calls bindExtensions() for full session lifecycle participation`
  4. `getBundledFactories accepts context to correctly scope per-context paths`

- [x] **GREEN** — Verify all four decision titles appear in `reespec/decisions.md`.
