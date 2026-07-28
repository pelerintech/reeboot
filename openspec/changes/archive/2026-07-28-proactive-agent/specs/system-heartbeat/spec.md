## ADDED Requirements

### Requirement: System heartbeat fires on configurable interval when enabled
When `config.heartbeat.enabled = true`, the scheduler SHALL start a parallel loop that fires every `config.heartbeat.interval` (parsed by the same human-friendly parser as `schedule_task`). The heartbeat SHALL dispatch through the orchestrator using the configured `contextId` in `isolated` context mode. The heartbeat is disabled by default (`enabled: false`).

#### Scenario: Heartbeat disabled by default
- **WHEN** config has no `heartbeat` block
- **THEN** no heartbeat loop is started

#### Scenario: Heartbeat fires at configured interval
- **WHEN** `config.heartbeat = { enabled: true, interval: "every 5m", contextId: "main" }`
- **THEN** orchestrator receives a heartbeat dispatch every 5 minutes

#### Scenario: Heartbeat uses isolated context mode
- **WHEN** heartbeat fires
- **THEN** it runs in a fresh isolated session (no conversation history from active chat)

#### Scenario: contextId not found — no heartbeat started
- **WHEN** `config.heartbeat.contextId` refers to a non-existent context
- **THEN** warning logged at startup, heartbeat loop does not start

### Requirement: Heartbeat prompt includes current task snapshot
Each heartbeat tick SHALL render a fresh prompt containing: current timestamp, list of due tasks (from the tasks DB), list of upcoming tasks (next 24 hours). The prompt SHALL explicitly instruct the agent to respond with the single word `IDLE` if nothing needs attention.

#### Scenario: Prompt contains due tasks
- **WHEN** heartbeat fires and there is 1 overdue task
- **THEN** the dispatched prompt includes that task's id and prompt text

#### Scenario: Prompt contains upcoming tasks
- **WHEN** heartbeat fires and there is 1 task due in 3 hours
- **THEN** the dispatched prompt includes that task

#### Scenario: Prompt contains IDLE instruction
- **WHEN** heartbeat prompt is rendered
- **THEN** prompt text includes "respond with a single word: IDLE"

### Requirement: IDLE response is silently suppressed
If the agent's response to a heartbeat tick is exactly `"IDLE"` (case-insensitive, trimmed), the response SHALL NOT be sent to any channel, SHALL NOT be logged to `task_runs`, and SHALL NOT produce any user-visible output.

#### Scenario: IDLE suppressed
- **WHEN** agent responds "IDLE" to heartbeat prompt
- **THEN** no message sent to any channel
- **THEN** no task_runs row inserted for this tick

#### Scenario: Non-IDLE response sent to default channel
- **WHEN** agent responds "I found 2 emails that need your attention." to heartbeat prompt
- **THEN** message sent to the context's default channel (e.g. WhatsApp or WebChat)

#### Scenario: IDLE detection is case-insensitive
- **WHEN** agent responds "idle" or "IDLE\n" or "  IDLE  "
- **THEN** all treated as IDLE — suppressed
