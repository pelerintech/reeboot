# Findings: Memory Consolidation, Scheduler Registration Race Conditions, and Extension Bootstrap Inconsistencies

**Date:** 2026-05-23  
**Scope:** `reeboot/src/extensions/memory-manager.ts`, `reeboot/src/extensions/knowledge-manager.ts`, `reeboot/src/scheduler-registry.ts`, `reeboot/src/server.ts`

---

## 1. How Memory Consolidation Is Supposed to Work

Memory consolidation is a scheduled background process that mines past conversations from the `messages` table and distils patterns into `MEMORY.md` and `USER.md`.

**Design flow:**
1. A cron job (`__memory_consolidation__`) is registered with the global scheduler (default: 2 AM daily).
2. On each run, it queries the `messages` table for conversations since the last `memory_log.ran_at` timestamp.
3. It builds a prompt containing current `MEMORY.md` + `USER.md` + recent conversation excerpts.
4. The LLM responds with structured operations:
   ```
   ADD memory: <content>
   ADD user: <content>
   REPLACE memory: <old text> -> <new text>
   REMOVE memory: <old text>
   ```
5. These are parsed by `parseConsolidationOps()` and applied via `memoryAdd()`, `memoryReplace()`, `memoryRemove()`.
6. If an `ADD` would exceed the character limit, a second LLM call auto-consolidates the file to make room, logging with `trigger='auto-capacity'`.
7. Every run writes an audit row to the `memory_log` table.

**Code locations:**
- Core logic: `reeboot/src/extensions/memory-manager.ts` — `runConsolidation()`
- Tests: `reeboot/tests/memory-consolidation.test.ts`, `reeboot/tests/extensions/memory-consolidation-race.test.ts`
- Specs: `reespec/requests/archive/2026-04-15-personal-memory/specs/consolidation.md`, `reespec/requests/archive/2026-05-22-agent-capabilities/specs/memory-consolidation.md`
- Leftover copy: `reeboot/extensions/memory-manager.ts` (older version, not loaded by runner)

---

## 2. The `session_start` Race Condition Fix — Partial Success

### Original bug
The memory extension originally tried to call `globalScheduler.registerJob()` at extension **load time** (inside `makeMemoryExtension()`). But `globalScheduler` is initialized to `noopScheduler` and only set to the real scheduler much later by `server.ts` via `setGlobalScheduler()`. So the job was silently dropped into a no-op void.

### The fix that was applied
The previous session's fix moved registration into a `session_start` event handler:

```ts
pi.on('session_start', () => {
  if (_consolidationRegistered) return;
  const scheduler = globalScheduler;
  if (scheduler && scheduler !== noopScheduler) {
    scheduler.registerJob({ id: '__memory_consolidation__', ... });
    _consolidationRegistered = true;
  }
});
```

### Why `session_start` exists (initial assumption was wrong)
`session_start` **is** a real pi event. It is emitted inside pi's `AgentSession._bindExtensionCore()` path:
- `AgentSession` constructor → `_buildRuntime()` → `_bindExtensionCore()` → `_extensionRunner.emit(_sessionStartEvent)`
- The `_sessionStartEvent` is `{ type: "session_start", reason: "startup" }` for the initial session.
- For reloads, `AgentSession.reload()` emits it again with reason `"reload"`.

So the handler **does** fire in production when an agent session is created.

### Why the fix is still not airtight
Looking at `server.ts` startup order:

```ts
// 1. Orchestrator created and started (~line 178-220)
_orchestrator = new OrchestratorClass(...);
_orchestrator.start();

// 2. Scheduler initialized (~line 262-288)
const schedulerInstance = new Scheduler(db, ...);
await schedulerInstance.start();
setGlobalScheduler(schedulerInstance);
```

There is a **window** after `orchestrator.start()` but before `setGlobalScheduler()`. If a message arrives during this window, a `AgentSession` is created, `session_start` fires — but `globalScheduler` is still `noopScheduler`. The guard skips registration, and critically, `_consolidationRegistered` stays **false**. But for a given session, `session_start` only fires once. So for that session's lifetime, consolidation is never registered.

**Verdict:** The `session_start` fix is *better* than load-time registration but still **racy during startup**.

---

## 3. The Deeper Architectural Problem: Three Competing Patterns

The codebase has evolved into a tangle of **three different, partially broken registration patterns** for accessing shared infrastructure (DB, scheduler, config) instead of a single unified bootstrap contract.

### Pattern A: Direct singleton imports (works but race-prone)
Used by: **scheduler-tool**, **budget-manager**, **token-meter**, **capabilities**, **memory-manager** (the scheduler import)

```ts
import { globalScheduler } from '../scheduler-registry.js';
import { getDb } from '../db/index.js';
```

These just import the mutable singletons. Works because the objects exist, but if the extension factory runs before the real scheduler/DB is set, you get the no-op stub.

### Pattern B: `pi.getScheduler()` / `pi.getDb()` / `pi.getConfig()` (BROKEN IN PRODUCTION)
Used by: **knowledge-manager**

```ts
const scheduler = (pi as any).getScheduler?.();
const db = (pi as any).getDb?.();
const config = (pi as any).getConfig?.();
```

**These methods do NOT exist on the real pi `ExtensionAPI` in production.** The pi SDK's `createExtensionAPI()` never defines `getScheduler`, `getDb`, or `getConfig`. They only exist in **test mocks** (`knowledge-lint-schedule.test.ts`).

What this means in production:
- `getScheduler?.()` → `undefined` → wiki lint cron job is **never registered**
- `getDb?.()` → `undefined` → sqlite-vec loading may be skipped
- `getConfig?.()` → `{}` → falls back to hardcoded defaults

The tests pass because someone hand-mocked these methods. Nobody noticed it doesn't work in production because the lint job is background and optional.

### Pattern C: Event-based deferred registration (works but racy)
Used by: **memory-manager** (the `session_start` fix)

```ts
pi.on('session_start', () => { globalScheduler.registerJob(...); });
```

Works for the common case, but racy during startup if the event fires before the scheduler is set.

### Summary table

| Extension | Pattern | Works in prod? | Notes |
|---|---|---|---|
| **scheduler-tool** | Direct `globalScheduler` import | ✅ Yes, racy at startup | Uses `globalScheduler` directly for all tool calls |
| **memory-manager** | `session_start` + `globalScheduler` | ✅ Yes, racy at startup | `_consolidationRegistered` stays false if fired too early |
| **knowledge-manager** | `pi.getScheduler()` | ❌ **Never** | Method doesn't exist on real pi API |
| **budget-manager** | Direct `getDb()` import | ✅ Yes | Uses lazy import inside tool execute |
| **token-meter** | Direct `getDb()` import | ✅ Yes | |
| **capabilities** | Direct `getDb()` import | ✅ Yes | |

---

## 4. What Was Actually Broken Yesterday vs. What Was Fixed

The previous session addressed a **scheduler registration race condition** in the memory extension. The question was asked: *"Would this fix also fix other things which fail to register?"*

**Answer: No.** Because the knowledge-manager is broken for an **entirely different reason** — it relies on phantom methods (`pi.getScheduler`, `pi.getDb`, `pi.getConfig`) that only exist in test mocks. The `session_start` / deferred registration pattern doesn't help knowledge-manager because it doesn't use that pattern at all.

There are actually **two separate bugs**:
1. **Memory consolidation registration race condition** — fixed partially by `session_start` handler, but still racy at startup.
2. **Knowledge lint job never registered in production** — `pi.getScheduler()` returns undefined in production; the job is silently skipped.

---

## 5. Why `createAgentSession` and `session_start` Matter

The key insight about how pi works in reeboot:

1. `PiAgentRunner._getOrCreateSession()` calls pi's `createAgentSession()`.
2. `createAgentSession()` builds a `SessionManager`, `SettingsManager`, etc.
3. `new AgentSession({ ..., sessionStartEvent: { type: "session_start", reason: "startup" } })`
4. `AgentSession` constructor → `_buildRuntime()` → creates `ExtensionRunner` → `_bindExtensionCore()` → `_extensionRunner.emit(_sessionStartEvent)`.

This is when `session_start` handlers fire. But this happens **inside the agent-runner**, which is created lazily on the first `prompt()` call. The first `prompt()` may fire before or after `setGlobalScheduler()` depending on whether an incoming message arrived before or after the scheduler was initialized.

---

## 6. Recommended Fix: Unified Deferred Registration in scheduler-registry.ts

The root cause is that `globalScheduler` is a mutable singleton that starts as a no-op stub. Any extension that touches it at load time is race-prone. The `scheduler-registry.ts` itself should solve this.

### Proposed change to `scheduler-registry.ts`

```ts
// scheduler-registry.ts
const pendingJobs: Array<JobDefinition> = [];
let _scheduler: Scheduler | null = null;

export function registerJob(job: JobDefinition): void {
  if (_scheduler) {
    _scheduler.registerJob(job);
  } else {
    pendingJobs.push(job);
  }
}

export function setGlobalScheduler(scheduler: Scheduler): void {
  _scheduler = scheduler;
  for (const job of pendingJobs) scheduler.registerJob(job);
  pendingJobs.length = 0;
}
```

Then **every** extension that needs scheduler access uses the same function at **load time**:

```ts
// memory-manager.ts
import { registerJob } from '../scheduler-registry.js';

registerJob({
  id: '__memory_consolidation__',
  contextId: 'main',
  schedule: memoryConfig.consolidation.schedule ?? '0 2 * * *',
  prompt: '__memory_consolidation__: ...',
});

// knowledge-manager.ts
import { registerJob } from '../scheduler-registry.js';

if (wikiEnabled) {
  registerJob({
    id: '__knowledge_lint__',
    contextId: 'main',
    schedule: knowledgeConfig.wiki?.lint?.schedule ?? '0 9 * * 1',
    prompt: '__knowledge_lint__: ...',
  });
}
```

**Benefits:**
- One pattern for all scheduler registrations
- No phantom events needed
- No phantom pi methods needed
- No race condition (queues until scheduler is ready)
- Fixes both memory consolidation AND knowledge lint in one change
- Works at extension load time (the natural place to register things)

### For knowledge-manager's DB access
Replace the phantom `pi.getDb?.()` with a direct `getDb()` singleton import, or pass the DB explicitly via the extension factory if needed.

---

## 7. Files That Need Changing

| File | Change |
|---|---|
| `src/scheduler-registry.ts` | Add `_pending` queue and `registerJob()` function |
| `src/extensions/memory-manager.ts` | Replace `session_start` handler with direct `registerJob()` call at load time |
| `src/extensions/knowledge-manager.ts` | Replace `pi.getScheduler?.()` with `registerJob()`; replace `pi.getDb?.()` with `getDb()` import; remove `pi.getConfig()` mock dependency |
| `tests/extensions/memory-consolidation-race.test.ts` | Update tests to verify `registerJob()` queues correctly instead of mocking `session_start` |
| `tests/knowledge-lint-schedule.test.ts` | Update mock to provide `registerJob` function on scheduler-registry, not fake `pi.getScheduler` |

---

## 8. Current State Summary

| Component | Status |
|---|---|
| `memory` tool (immediate writes) | ✅ Works |
| `session_search` tool | ✅ Works |
| System prompt injection | ✅ Works |
| `runConsolidation()` logic | ✅ Works when called directly |
| Scheduled background consolidation | ⚠️ **Partially broken** — `session_start` fix helps but startup race remains |
| Auto-capacity consolidation | ⚠️ **Partially broken** — only works if scheduled path is reached |
| Knowledge wiki lint job | ❌ **Completely broken in production** — `pi.getScheduler()` is undefined |

---

## 9. Conclusion

The codebase needs a **single, consistent bootstrap contract** for shared infrastructure access. The current state is a mess of:

1. Direct mutable singleton imports (works but race-prone)
2. Imaginary `pi.getXxx()` methods that only exist in tests (silently broken)
3. Event-based deferred access that is better but still racy at startup

A deferred-queue registry pattern would collapse all of this into **one reliable, load-time registration** that works for all extensions and fixes both the memory consolidation startup race and the knowledge-manager's completely-broken scheduler registration.
