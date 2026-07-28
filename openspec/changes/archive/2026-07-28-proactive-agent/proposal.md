## Why

The scheduler upgrade gives reeboot a solid foundation for explicit user-defined tasks. But a truly useful personal agent should also be able to wake itself up, notice when things need attention, and act without being asked. A heartbeat loop enables this: the agent checks in on a regular cadence, looks at its task list, and either acts or stays quiet. This is the difference between a task-executor and an autonomous agent.

Additionally, the current scheduler blocks the agent turn for the duration of any `sleep`-based wait in bash. The in-session `timer` and `heartbeat` tools (borrowed from `@marcfargas/pi-heartbeat`) replace blocking sleeps with non-blocking waits that return immediately and wake the agent later via `pi.sendMessage({ triggerTurn: true })`.

## What Changes

- System heartbeat: opt-in, configurable interval, runs in isolated context, fires even when no user is chatting
- Heartbeat prompt rendered dynamically at fire time: includes current due/upcoming task list for agent self-inspection
- Agent's `IDLE` response silently swallowed — no noise, no LLM cost logged to user channels
- In-session `timer` tool: one-shot non-blocking wait, wakes agent via `triggerTurn`
- In-session `heartbeat` tool: periodic non-blocking wake, wakes agent via `triggerTurn`; one active at a time per session
- Sleep interceptor: bash guard that blocks `sleep` when sole/last command, redirects agent to use `timer`
- `pi.on("session_shutdown")` cleanup: in-session timers and heartbeats cleared on session end
- `config.heartbeat` block: `enabled`, `interval` (human-friendly string), `contextId`
- All features follow TDD red/green: failing tests written first

## Capabilities

### New Capabilities
- `system-heartbeat`: persistent system-managed autonomous wake-up loop; dispatches through orchestrator; IDLE suppression; isolated session mode
- `in-session-timer`: `timer` pi tool — one-shot non-blocking wait, fires `triggerTurn`
- `in-session-heartbeat`: `heartbeat` pi tool — periodic non-blocking wake, fires `triggerTurn`; session-scoped
- `sleep-interceptor`: bash guard redirecting blocking `sleep` calls to `timer` tool

### Modified Capabilities

## Impact

- `src/scheduler.ts`: add system heartbeat loop alongside task poll loop
- `src/scheduler-registry.ts`: expose heartbeat start/stop
- `extensions/scheduler-tool.ts`: add `timer` tool, `heartbeat` tool, sleep interceptor, `session_shutdown` cleanup
- `src/config.ts`: add `heartbeat` config block
- `tests/scheduler.test.ts`: add heartbeat scenarios
- `tests/scheduler-tool.test.ts`: add timer/heartbeat/sleep-interceptor scenarios
- No new npm deps (pi's `sendMessage` API is already available; `triggerTurn` is part of pi SDK)
