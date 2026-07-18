# Design — service-bootstrap

## Four Service Categories

Every service, hook, and registration in reeboot belongs to exactly one category. The category determines where and how it is started.

```
Cat 1 — Server Services      Start at boot. Own lifecycle. Independent of sessions.
Cat 2 — Background Jobs      Cron tasks in the DB. Must exist before first poll tick.
Cat 3 — Session Hooks        Pi extension events. Per-session, per-prompt.
Cat 4 — Tool Registrations   pi.registerTool() inside extension factories. Already correct.
```

### Cat 1 — Server Services (no changes needed)

`server.ts` already handles these correctly in order:
`openDatabase → migrations → initLogger → initChannels → Orchestrator → Scheduler → Heartbeat`

The only change: a new `src/bootstrap.ts` module is called after `setGlobalScheduler()` to handle Cat 2.

### Cat 2 — Background Jobs (`src/bootstrap.ts`)

**Shape A** (chosen during discovery): each extension file that needs a background job exports a `registerServerJobs(db, scheduler, config)` function alongside its extension factory. A central `src/bootstrap.ts` calls all of them explicitly after the scheduler is ready.

```
server.ts
  └── setGlobalScheduler(scheduler)
  └── bootstrapServerJobs(db, scheduler, config)   ← new, after scheduler is set
        ├── memoryServerJobs(db, scheduler, config)   ← from memory-manager.ts
        └── knowledgeServerJobs(db, scheduler, config) ← from knowledge-manager.ts
```

**Why Shape A over a central manifest:**
- Cohesion: everything a feature needs (tools, hooks, background jobs) lives in one file.
- Extensibility: adding a new capability means adding one export to its file and one call in `bootstrap.ts`.
- Discoverability: reading `memory-manager.ts` shows the full picture of the memory subsystem.

**Deferred queue in `scheduler-registry.ts`:**
Any `registerJob()` call that races startup is queued and drained when `setGlobalScheduler()` is called. This eliminates the startup race entirely and makes job registration order-independent. Extensions can call `registerJob()` at any time without caring when the scheduler initialises.

```ts
// New pattern: scheduler-registry.ts
const _pending: JobDef[] = [];
let _real: Scheduler | null = null;

export function registerJob(job: JobDef): void {
  _real ? _real.registerJob(job) : _pending.push(job);
}

export function setGlobalScheduler(s: Scheduler): void {
  _real = s;
  globalScheduler = s;
  for (const job of _pending) s.registerJob(job);
  _pending.length = 0;
}
```

**Idempotency:** `Scheduler.registerJob()` already checks for existing rows (`SELECT id FROM tasks WHERE id = ?`) and skips if present. Background jobs use stable IDs (`__memory_consolidation__`, `__knowledge_lint__`). Re-registering on restart is a no-op — the row and its `next_run` are preserved.

**Logging:** `bootstrap.ts` wraps each `registerServerJobs()` call in try/catch:
- Success → `logger.info()` → stdout only
- Failure → `logger.error()` → stdout + `operational_logs` (automatic via pino warn+ threshold)

### Cat 3 — Session Lifecycle (`pi-runner.ts`)

**`bindExtensions` must be called** after `createAgentSession()`. This fires `session_start` for all extensions on the runner — bundled and user-defined.

```ts
// _getOrCreateSession() in pi-runner.ts
const { session } = await createAgentSession(sessionOpts);
await session.bindExtensions({
  shutdownHandler: () => {
    // pi-internal shutdown request — treat as reset
    this.reset().catch(() => {});
  },
});
this._session = session;
```

`shutdownHandler` is `() => void` — zero complexity. It bridges the case where something inside a pi extension calls `ctx.shutdown()` (e.g. a future "power off" command), routing it to the runner's existing `reset()` path.

**`session_shutdown` must be emitted** before `_session` is nulled in `reset()` and `dispose()`:

```ts
async reset(): Promise<void> {
  this.abort();
  if (this._session) {
    await emitSessionShutdownEvent(
      (this._session as any)._extensionRunner,
      { type: 'session_shutdown', reason: 'new' }
    );
  }
  this._session = null;
  this.disposed = false;
}
```

`emitSessionShutdownEvent` is exported from `@earendil-works/pi-coding-agent`. It's a no-op if no handlers are registered, so there's no risk calling it unconditionally.

### Cat 3 — `session_start` usage after the fix

With `bindExtensions()` now called, `session_start` fires. The only current use is the consolidation job registration in `memory-manager.ts` — which becomes unnecessary once Cat 2 (bootstrap.ts) handles job registration directly. The `session_start` handler in `memory-manager.ts` is removed as part of this request; job registration moves to `registerServerJobs()`.

### Cat 4 — Extension dependency injection fixes

**`knowledge-manager.ts`:** Replace phantom `pi.getXxx()` calls with explicit argument passing, matching the pattern already used by `memory-manager`, `budget-manager`, and `observability`:

```ts
// Before (broken):
export default function knowledgeManagerExtension(pi: ExtensionAPI): void {
  const config = (pi as any).getConfig?.() ?? {};  // always {}
  const db = (pi as any).getDb?.();               // always undefined
  const scheduler = (pi as any).getScheduler?.(); // always undefined
}

// After (correct):
export function makeKnowledgeExtension(pi: ExtensionAPI, config: Config): void {
  // config passed explicitly by loader
}
export function registerServerJobs(db: Database, scheduler: SchedulerToolsTarget, config: Config): void {
  // called by bootstrap.ts, not by the extension factory
}
```

The loader passes `config` explicitly (already does this for memory-manager, web-search, mcp-manager).
The loader passes `db` explicitly to `makeKnowledgeExtension` for sqlite-vec loading and schema migration.

**`session_search` in `memory-manager.ts`:** Replace `require()` with dynamic `import()`:

```ts
// Before (ESM crash):
const { getDb } = require('../db/index.js');

// After:
const { getDb } = await import('../db/index.js');
```

**`budget-manager` in `loader.ts`:** Pass `context.workspacePath` instead of `process.cwd()`. This requires `getBundledFactories()` to accept `context` as well as `config`:

```ts
// Before:
export function getBundledFactories(config: Config): ExtensionFactory[]

// After:
export function getBundledFactories(context: ContextConfig, config: Config): ExtensionFactory[]
```

`createLoader()` already has both `context` and `config` — it just wasn't forwarding `context` into `getBundledFactories`.

## File Change Map

| File | Change |
|---|---|
| `src/scheduler-registry.ts` | Add `_pending` queue, `registerJob()` export, drain in `setGlobalScheduler()` |
| `src/bootstrap.ts` | New file. Calls `registerServerJobs()` for each extension that needs it |
| `src/server.ts` | Call `bootstrapServerJobs()` after `setGlobalScheduler()` |
| `src/agent-runner/pi-runner.ts` | Call `bindExtensions()` after session creation; emit `session_shutdown` in `reset()`/`dispose()` |
| `src/extensions/memory-manager.ts` | Add `registerServerJobs()` export; remove `session_start` handler; fix `require()` → `import()` |
| `src/extensions/knowledge-manager.ts` | Replace phantom `pi.getXxx()` with explicit args; add `registerServerJobs()` export |
| `src/extensions/loader.ts` | Pass `context` into `getBundledFactories()`; pass correct `workspacePath` to budget-manager; pass `db` + `config` to knowledge-manager |
| `tests/extensions/memory-consolidation-race.test.ts` | Update to test `registerServerJobs()` instead of `session_start` handler |
| `tests/extensions/knowledge-manager.test.ts` | Update mock to pass explicit `config`/`db`; add `registerServerJobs()` test |
| `tests/scheduler-registry.test.ts` (new or existing) | Test deferred queue behaviour |
| `tests/agent-runner/pi-runner-lifecycle.test.ts` (new) | Test `bindExtensions()` called, `session_shutdown` emitted on reset |

## Risks

**`emitSessionShutdownEvent` accesses `_extensionRunner` as a private field.** The pi SDK doesn't expose the extension runner publicly on `AgentSession`. We access it via `(session as any)._extensionRunner`. This is the same `any`-cast pattern already used throughout the codebase for other internal pi fields. Risk: pi SDK change breaks the cast. Mitigation: the call is wrapped in try/catch; failure is logged but doesn't break reset.

**`bindExtensions()` is async and called inside `_getOrCreateSession()`.** Adding an `await` here is safe — `_getOrCreateSession` is already async. The only risk is a slow `session_start` handler in a user extension delaying the first prompt. Acceptable: this is the documented contract for `session_start`.

**Deferred queue in scheduler-registry.ts re-registers on restart.** `Scheduler.registerJob()` is idempotent (skips existing rows), so re-running bootstrap on every server start is harmless. `next_run` on the existing DB row is preserved.
