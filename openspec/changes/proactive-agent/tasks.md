## 1. Test Infrastructure (RED — all failing tests first)

- [x] 1.1 Write failing tests for system-heartbeat: disabled by default, fires at configured interval, isolated context mode, invalid contextId warning, prompt contains due/upcoming tasks, IDLE instruction in prompt, IDLE suppressed (no channel send, no task_runs row), non-IDLE sent to channel, case-insensitive IDLE detection
- [x] 1.2 Write failing tests for in-session-timer: returns immediately, fires after delay (fake timers), multiple independent, same-id replaces, out-of-range rejected, session_shutdown clears
- [x] 1.3 Write failing tests for in-session-heartbeat: start returns immediately, fires on each tick, tick message includes count, new heartbeat replaces old, stop cancels, status shows state, status when none active, out-of-range interval rejected, session_shutdown stops heartbeat
- [x] 1.4 Write failing tests for sleep-interceptor: bare sleep blocked, sleep-last-in-chain blocked, sleep-not-last allowed, sleep-in-middle allowed, disabled by env var

## 2. Heartbeat Config (GREEN)

- [x] 2.1 Add `heartbeat` block to `src/config.ts` schema: `{ enabled: boolean, interval: string, contextId: string }` with defaults `{ enabled: false, interval: "every 5m", contextId: "main" }`; write passing config parse tests

## 3. System Heartbeat (GREEN)

- [x] 3.1 Implement `renderHeartbeatPrompt(dueTasks, upcomingTasks)` in `src/scheduler/heartbeat.ts` — renders prompt with timestamp, task lists, IDLE instruction; ensure prompt content scenarios in 1.1 pass
- [x] 3.2 Implement `startHeartbeat(config, orchestrator)` in `src/scheduler.ts` — parallel loop alongside task poll, isolated dispatch, IDLE suppression; ensure all 1.1 heartbeat scenarios pass
- [x] 3.3 Update `src/scheduler-registry.ts` — expose `startHeartbeat()` / `stopHeartbeat()` for clean shutdown

## 4. In-Session Timer Tool (GREEN)

- [x] 4.1 Implement `TimerManager` class in `extensions/scheduler-tool.ts` (or `src/scheduler/timer-manager.ts`) — `setTimer(seconds, message, id?)`, `cancelTimer(id)`, `clearAll()`; ensure timer management scenarios in 1.2 pass
- [x] 4.2 Register `timer` tool in `extensions/scheduler-tool.ts` using `TimerManager` + `pi.sendMessage({ triggerTurn: true })`; ensure timer tool scenarios in 1.2 pass
- [x] 4.3 Register `pi.on("session_shutdown", () => manager.clearAll())` in extension; ensure session_shutdown timer scenario in 1.2 passes

## 5. In-Session Heartbeat Tool (GREEN)

- [x] 5.1 Add `startHeartbeat(interval_seconds, message)`, `stopHeartbeat()`, `getHeartbeatState()` to `TimerManager`; ensure heartbeat management scenarios in 1.3 pass
- [x] 5.2 Register `heartbeat` tool in `extensions/scheduler-tool.ts` — start/stop/status actions; ensure all 1.3 heartbeat tool scenarios pass
- [x] 5.3 Verify `session_shutdown` handler also stops in-session heartbeat; ensure 1.3 shutdown scenario passes

## 6. Sleep Interceptor (GREEN)

- [x] 6.1 Implement `isSleepOnlyOrLast(command: string): boolean` utility; ensure all 1.4 detection scenarios pass
- [x] 6.2 Register bash pre-hook in `extensions/scheduler-tool.ts` using `isSleepOnlyOrLast()` + `REEBOOT_SLEEP_INTERCEPTOR` env check; ensure all 1.4 interceptor scenarios pass

## 7. Integration & Documentation

- [x] 7.1 Run full test suite — all 1.1–1.4 tests must be green; no regressions in scheduler-upgrade tests
- [x] 7.2 Manual smoke test (system heartbeat): set `config.heartbeat = { enabled: true, interval: "every 1m", contextId: "main" }`, start agent, wait 2 minutes, verify agent wakes and responds IDLE (check logs)
- [x] 7.3 Manual smoke test (timer): in WebChat say "set a timer for 10 seconds to remind me to check X", verify agent sets timer and returns immediately, then wake message appears 10s later
- [x] 7.4 Manual smoke test (sleep interceptor): in WebChat ask agent to `sleep 30`, verify it is blocked and agent uses timer instead
- [x] 7.5 Update `README.md` with proactive agent section: heartbeat config, timer/heartbeat tools usage, sleep interceptor note
