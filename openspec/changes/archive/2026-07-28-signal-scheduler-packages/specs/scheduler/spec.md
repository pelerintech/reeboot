## ADDED Requirements

### Requirement: Scheduler loads and starts tasks from SQLite on startup
`src/scheduler.ts` SHALL read all enabled tasks from the `tasks` table on startup and register each as a `node-cron` job. When a cron job fires, the scheduler SHALL inject the task's `prompt` into the task's `contextId` via the orchestrator (same path as a user message).

#### Scenario: Enabled task is registered on startup
- **WHEN** scheduler starts and the tasks table contains an enabled task
- **THEN** the cron job is registered for that task

#### Scenario: Disabled task is not registered
- **WHEN** tasks table contains a task with `enabled = 0`
- **THEN** no cron job is registered for that task

#### Scenario: Scheduled task prompt is dispatched to orchestrator
- **WHEN** a cron job fires
- **THEN** the orchestrator receives the task's prompt with `channelType: "scheduler"` and `contextId` matching the task

### Requirement: scheduler-tool.ts provides agent-callable schedule/list/cancel tools
`extensions/scheduler-tool.ts` SHALL register three pi tools: `schedule_task(schedule, prompt, contextId?)`, `list_tasks()`, `cancel_task(taskId)`. These tools read and write the `tasks` SQLite table directly via `getDb()`.

#### Scenario: Agent creates a scheduled task
- **WHEN** agent calls `schedule_task` with a valid cron expression and prompt
- **THEN** a new row is inserted in the `tasks` table and the cron job is registered

#### Scenario: Invalid cron expression returns tool error
- **WHEN** agent calls `schedule_task` with `schedule: "not-a-cron"`
- **THEN** tool returns an error: "Invalid cron expression: not-a-cron"

#### Scenario: Agent lists tasks
- **WHEN** agent calls `list_tasks()`
- **THEN** tool returns all tasks with id, schedule, prompt, contextId, enabled, lastRun

#### Scenario: Agent cancels a task
- **WHEN** agent calls `cancel_task(taskId)` for an existing task
- **THEN** the cron job is unregistered and the row is deleted from the tasks table

### Requirement: Task last_run is updated after each execution
After a scheduled task fires and the orchestrator processes it, the `last_run` column in the `tasks` table SHALL be updated to the current Unix timestamp.

#### Scenario: last_run is updated after task fires
- **WHEN** a cron job fires and the agent turn completes
- **THEN** the task's `last_run` in SQLite is set to the current timestamp
