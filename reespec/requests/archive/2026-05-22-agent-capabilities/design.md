# Design: Agent Capabilities Discovery & Memory Fix

## Decisions

### 1. Centralized capabilities-discovery extension (`capabilities.ts`)

A new bundled extension `src/extensions/capabilities.ts` that:
- Registers on `before_agent_start` (fires once per session, not per turn)
- Calls `pi.getAllTools()` to discover every registered tool dynamically
- Filters out built-in pi tools (bash, read, edit, write, grep, find, ls) — these are already visible via pi's default system prompt
- Builds a structured block grouping tools by source (reeboot bundled / user extension / MCP / skill)
- Appends the block to `event.systemPrompt` via the `BeforeAgentStartEventResult` return

**Why this approach:**
- `pi.getAllTools()` is the only API that sees ALL tools regardless of whether they have `promptSnippet`. It returns `ToolInfo[]` with name, description, parameters schema, and source metadata.
- `before_agent_start` is the correct hook for system prompt injection per existing decision (token-budget request, TB-3).
- Filtering built-ins avoids duplication with pi's own "Available tools" section.

**Rejected alternatives:**
- Adding `promptSnippet` to every tool individually — scattered, forgettable, still misses user extensions.
- Patching pi's system prompt builder — would require modifying pi internals, violates the bundled-dependency decision.
- Injecting per-turn — too expensive; `before_agent_start` fires once per session creation.

### 2. Memory consolidation race condition fix

The memory extension currently calls `require('../scheduler-registry.js').globalScheduler.registerJob(...)` inside `makeMemoryExtension` at extension load time. At that moment `globalScheduler` is `noopScheduler` (exported from `scheduler-registry.ts`).

**Fix:** Move the consolidation job registration to a `session_start` event handler inside the memory extension. `session_start` fires after the server has initialized the real scheduler and called `setGlobalScheduler()`. The handler checks if the job is already registered (guard against double-registration on reload) and registers it with the now-real scheduler.

**Why `session_start` not `server.ts`:** Keeps the concern inside the memory extension. Server.ts shouldn't know about memory internals.

**Rejected alternatives:**
- Polling in `makeMemoryExtension` to wait for scheduler — ugly, racy, introduces setInterval.
- Moving registration to `server.ts` — couples memory to server bootstrap, violates extension encapsulation.

### 3. Tool filtering rules

`pi.getAllTools()` returns everything including built-ins. We filter by source to avoid duplicating pi's own tool list:
- **Included:** Any tool where `sourceInfo.path` is NOT under pi's core tools directory.
- **Excluded:** Tools from `@earendil-works/pi-coding-agent` package internals (bash, read, edit, etc.).
- **Included:** All reeboot bundled extensions, user extensions, MCP tools, skills.

This is a heuristic based on source path. If pi's tool path format changes, we may need to adjust.

### 4. Observability: `capabilities_injected` event

On each `before_agent_start` where capabilities are injected, emit an audit event to the `events` table:
- `type: 'capabilities_injected'`
- `payload: { toolCount: N, toolNames: string[], sourceBreakdown: { bundled: N, user: N, mcp: N, skill: N } }`
- Uses existing `emitEvent()` from observability system

This gives the owner a concrete record that the mechanism is working.

### 5. Token cost acceptance

The structured capabilities block will cost ~300-500 tokens per session. This is accepted per brief constraint. The budget system (token-meter + BudgetGuard) already handles per-turn limits. No new budget logic needed.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Extension Loader (loader.ts)                                    │
│  ──────────────────────                                          │
│  Loads all extensions in order:                                  │
│    confirm, protected, session-name, compaction, scheduler,      │
│    token-meter, web-search, skill-manager, mcp, injection,      │
│    memory-manager, budget-manager, observability,                │
│    → capabilities ← NEW                                         │
│    knowledge-manager (gated)                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Capabilities Extension (capabilities.ts)                        │
│  ────────────────────────────────────                            │
│  before_agent_start handler:                                       │
│    1. tools = pi.getAllTools()                                    │
│    2. filtered = excludeBuiltInTools(tools)                     │
│    3. block = buildCapabilitiesBlock(filtered)                    │
│    4. return { systemPrompt: event.systemPrompt + block }       │
│    5. emitEvent('capabilities_injected', { ... })               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Memory Extension (memory-manager.ts) — FIX                      │
│  ─────────────────────────────────────                           │
│  REMOVE: consolidation registration from makeMemoryExtension     │
│  ADD: session_start handler:                                      │
│    if (!consolidationJobRegistered):                             │
│      scheduler = require('../scheduler-registry').globalScheduler │
│      if (scheduler !== noopScheduler):                            │
│        scheduler.registerJob({ id: '__memory_consolidation__' }) │
│        consolidationJobRegistered = true                         │
└─────────────────────────────────────────────────────────────────┘
```

## Risks

1. **Source path heuristic breaks** — If pi changes how `sourceInfo.path` is reported, built-in tool filtering may fail. Mitigation: unit test the filter function against known pi tool paths.
2. **Too many tools** — If a user has 50+ MCP tools, the capabilities block could exceed reasonable size. Mitigation: cap at 30 tools, emit warning if truncated.
3. **Double-injection on session resume** — `before_agent_start` may fire again on resumed sessions. The capabilities block is idempotent (appending to system prompt), so this is harmless but costs tokens. Mitigation: the block is stateless — acceptable.
4. **Memory consolidation still doesn't run** — Even with the race fix, the scheduler's cron job might not trigger if the process restarts between 2am and next cron tick. Mitigation: add `applyScheduledCatchup` on startup (already exists in resilience system) — the consolidation task is a scheduled task so it will be caught up.

## Files Changed

- **NEW:** `reeboot/src/extensions/capabilities.ts` — the discovery extension
- **NEW:** `reeboot/tests/extensions/capabilities.test.ts` — tests
- **MODIFY:** `reeboot/src/extensions/memory-manager.ts` — move consolidation registration to `session_start`
- **MODIFY:** `reeboot/src/extensions/loader.ts` — add capabilities factory to bundled factories
- **MODIFY:** `reeboot/tests/extensions/memory-manager.test.ts` — add race condition test
