# Brief — service-bootstrap

## Problem

The agent is not fully capable after a cold start. Several critical capabilities — memory consolidation, knowledge lint, session lifecycle events, MCP process cleanup — only work when a user sends a first message (or never work at all). The root causes are:

1. **Background jobs (Cat 2) never register.** `__memory_consolidation__` and `__knowledge_lint__` are supposed to appear in the `tasks` table at boot so the scheduler's poll loop can fire them. They don't, because they were wired to `session_start` — an event that requires `bindExtensions()` to be called, which reeboot never does.

2. **Session lifecycle events never fire.** `session_start` and `session_shutdown` are pi SDK events that only emit when `AgentSession.bindExtensions()` is called. Reeboot never calls it, so: user-defined extensions that hook `session_start` or `session_shutdown` are silently broken, MCP child processes leak on reset, file watchers never stop.

3. **`knowledge-manager` is completely dead.** It reads config/db/scheduler via `(pi as any).getConfig?.()`, `(pi as any).getDb?.()`, `(pi as any).getScheduler?.()` — none of which exist on the real `ExtensionAPI`. The extension exits immediately, registering nothing.

4. **`session_search` crashes silently.** Uses `require()` inside an ESM module (`"type": "module"`). Throws `ReferenceError` at runtime, caught and swallowed as "Database not available".

5. **`budget-manager` gets wrong workspace path.** Loader passes `process.cwd()` (the reeboot package root at startup) instead of the context's actual workspace path.

6. **`scheduler-registry.ts` has no deferred queue.** Any `registerJob()` call that races startup (before `setGlobalScheduler()`) is silently dropped into a no-op stub with no recovery.

## Vision

The agent is fully capable immediately after `reeboot start` — before any user sends a message. Background jobs are in the DB. Session events fire correctly. Extensions receive dependencies through explicit arguments, not through phantom `pi.getXxx()` methods. A single, auditable bootstrap module owns all server-level service startup.

## Goals

- Background jobs (`__memory_consolidation__`, `__knowledge_lint__`) are in the `tasks` table within seconds of server start, regardless of whether any user session has been created.
- `session_start` and `session_shutdown` fire correctly for all extensions — bundled and user-defined — on every session create/reset/dispose.
- `knowledge-manager` is fully operational: correct config/db/scheduler injection, tools registered, file watcher running.
- `session_search` works in production (ESM-compatible DB import).
- `budget-manager` uses the correct context workspace path.
- `scheduler-registry` defers job registrations that arrive before the real scheduler is set.
- A single `src/bootstrap.ts` module owns the authoritative list of what to start at boot. Adding a new background job means adding one export to the relevant extension file and one call in `bootstrap.ts` — nothing else.
- Boot-time failures are logged as errors (captured in `operational_logs`). Successes are info-level (stdout only).

## Non-Goals

- Not changing the scheduler's poll logic or task execution.
- Not changing the heartbeat, resilience startup, or channel init sequences.
- Not adding new background jobs beyond the two already designed.
- Not changing how user-defined extensions are discovered or loaded.

## Impact

- Memory consolidation starts running nightly without any user interaction.
- Knowledge tools (`knowledge_search`, `knowledge_ingest`, wiki tools) become operational when `knowledge.enabled: true`.
- MCP child processes are cleaned up on session reset.
- User-defined extensions that use `session_start`/`session_shutdown` work as documented.
- The agent can be trusted to be fully capable immediately after start.
