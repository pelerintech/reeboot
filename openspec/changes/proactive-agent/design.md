## Context

The scheduler upgrade (`scheduler-upgrade` change) delivers the poll loop and task model. This change builds on top of it, adding two independent things: (1) a system heartbeat that uses the same orchestrator dispatch path as scheduled tasks, and (2) in-session tools (`timer`, `heartbeat`, sleep interceptor) that use the pi SDK's `sendMessage({ triggerTurn: true })` API to wake the agent without blocking.

These are deliberately separate because they solve different problems and have different persistence models:
- System heartbeat: persistent, DB-independent, fires even when no one is chatting, uses orchestrator dispatch
- In-session tools: ephemeral, memory-only, requires an active pi session, uses pi.sendMessage

TDD mandate: every feature has failing tests first.

## Goals / Non-Goals

**Goals:**
- System heartbeat: poll-based, isolated context, live prompt with task snapshot, IDLE suppression
- `config.heartbeat`: `enabled` (default false), `interval` (human-friendly string, same parser as schedule_task), `contextId`
- In-session `timer` tool: one-shot, 1–3600s, returns immediately, fires `pi.sendMessage triggerTurn`
- In-session `heartbeat` tool: periodic, 10–3600s, one active per session, start/stop/status actions
- Sleep interceptor: bash pre-hook, blocks `sleep` when sole/last command, disabled by `REEBOOT_SLEEP_INTERCEPTOR=0`
- `session_shutdown` cleanup: clear all in-session timers and heartbeat on session end

**Non-Goals:**
- Heartbeat stored in tasks table (it's a system concern, not user-visible work)
- Multiple concurrent in-session heartbeats (one at a time, same as pi-heartbeat)
- Configuring heartbeat from chat (config.json only for now)
- `/cancel-timer` slash command (deferred; user can ask agent to stop heartbeat via `heartbeat(action: 'stop')`)

## Decisions

### D1: System heartbeat as a parallel loop in scheduler.ts

The heartbeat runs alongside the task poll loop, not as a special task in the DB:

```typescript
// In src/scheduler.ts, alongside startPollLoop()
function startHeartbeat(config: HeartbeatConfig, orchestrator: Orchestrator) {
  const { intervalMs } = parseHumanInterval(config.interval);
  const tick = async () => {
    const prompt = renderHeartbeatPrompt(getDueTasks(), getUpcomingTasks(24));
    const result = await orchestrator.handleHeartbeatTick({ contextId: config.contextId, prompt });
    if (result.trim().toUpperCase() === 'IDLE') {
      // silently discard — no channel notification, no DB write
    } else {
      // send result to context's default channel
      orchestrator.sendToDefaultChannel(config.contextId, result);
    }
    setTimeout(tick, intervalMs);
  };
  if (config.enabled) setTimeout(tick, intervalMs);
}
```

**Why not a task row:** Heartbeat is infrastructure; users shouldn't see it in `list_tasks`. Config-controlled, not agent-controlled.

### D2: IDLE suppression — string comparison, case-insensitive

Agent response is trimmed and upper-cased before comparison. Only `"IDLE"` (one word) triggers suppression. If agent returns `"IDLE - nothing to do"` it is NOT suppressed (sent to channel). Prompt is explicit: "If nothing to do, respond with a single word: IDLE".

### D3: In-session tools use pi.sendMessage({ triggerTurn: true })

```typescript
// In extensions/scheduler-tool.ts
const timeout = setTimeout(() => {
  pi.sendMessage(
    { content: `⏰ Timer fired: ${message}`, display: true },
    { triggerTurn: true }
  );
}, seconds * 1000);
```

This is the pi-native wake-up mechanism. The agent returns from the tool call immediately; the message is injected into the conversation when the timer fires, starting a new agent turn.

**Why not orchestrator dispatch for in-session timers:** In-session timers are conversational — they are part of an active dialogue. The pi `triggerTurn` mechanism is the right level. Orchestrator dispatch is for background tasks that may fire when no session is active.

### D4: Sleep interceptor as bash pre-hook

Pi's extension API supports `registerBashHook('pre', fn)` which intercepts bash calls before execution. The interceptor checks if `sleep` is the sole or last command:

```typescript
pi.registerBashHook('pre', (command: string) => {
  if (process.env.REEBOOT_SLEEP_INTERCEPTOR === '0') return;
  if (isSleepOnlyOrLast(command)) {
    return {
      block: true,
      message: 'Blocking sleep. Use timer(seconds, message) for non-blocking waits.'
    };
  }
});

function isSleepOnlyOrLast(cmd: string): boolean {
  const parts = cmd.trim().split(/&&|\|/).map(s => s.trim());
  return parts.some((p, i) => p.startsWith('sleep') && i === parts.length - 1);
}
```

`sleep 2 && npm start` is allowed (sleep is not last). `npm build && sleep 60` is blocked.

### D5: TDD approach for heartbeat IDLE suppression

The hardest behaviour to test: verify that IDLE response does NOT trigger a channel notification. Test strategy:

```typescript
it('IDLE response is not sent to channel', async () => {
  const sendSpy = vi.fn();
  const orchestrator = makeOrchestrator({ handleHeartbeat: async () => 'IDLE', send: sendSpy });
  await tickHeartbeat(orchestrator, config);
  expect(sendSpy).not.toHaveBeenCalled();
});

it('non-IDLE response is sent to channel', async () => {
  const sendSpy = vi.fn();
  const orchestrator = makeOrchestrator({ handleHeartbeat: async () => 'I checked emails.', send: sendSpy });
  await tickHeartbeat(orchestrator, config);
  expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('I checked emails.'));
});
```

## Risks / Trade-offs

- **Heartbeat costs LLM tokens silently** → disabled by default; `reeboot status` will show heartbeat run count (future)
- **Agent always returns non-IDLE (verbose every tick)** → prompt is explicit; add a test asserting IDLE on "nothing to do" scenario
- **In-session timers fire after session ends** → `session_shutdown` handler clears all; edge case: if handler not called (process kill) → timer is orphaned but process is dead so no effect
- **Sleep interceptor breaks legitimate use** → `REEBOOT_SLEEP_INTERCEPTOR=0` escape hatch; `sleep X && start` pattern explicitly allowed

## Open Questions

- Should heartbeat tick count be stored anywhere (for `reeboot status`)? Deferred — future observability feature.
- What if heartbeat `contextId` doesn't exist? Log warning at startup, don't start heartbeat. Document in config schema.
