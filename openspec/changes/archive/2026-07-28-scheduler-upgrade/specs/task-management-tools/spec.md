## ADDED Requirements

### Requirement: schedule_task accepts human-friendly schedule string
The `schedule_task` agent tool SHALL accept `prompt: string`, `schedule: string` (auto-detected type), and optional `context_mode: 'shared' | 'isolated'` (default `'shared'`). It SHALL validate the schedule string via `detectScheduleType()` and return an error message on invalid input rather than creating a broken task.

#### Scenario: Natural language interval accepted
- **WHEN** agent calls `schedule_task("check emails", "every 30m")`
- **THEN** task created with `schedule_type='interval'`, `normalized_ms=1800000`, correct `next_run`

#### Scenario: Cron expression accepted
- **WHEN** agent calls `schedule_task("morning report", "0 9 * * *")`
- **THEN** task created with `schedule_type='cron'`, valid `next_run`

#### Scenario: ISO datetime accepted as once
- **WHEN** agent calls `schedule_task("Friday summary", "2026-03-21T17:00:00Z")`
- **THEN** task created with `schedule_type='once'`, `next_run = "2026-03-21T17:00:00Z"`

#### Scenario: Invalid schedule returns error
- **WHEN** agent calls `schedule_task("test", "not-a-schedule")`
- **THEN** tool returns error string, no task created in DB

#### Scenario: context_mode=isolated stored
- **WHEN** agent calls `schedule_task("price check", "hourly", context_mode="isolated")`
- **THEN** task stored with `context_mode='isolated'`

### Requirement: pause_task and resume_task tools available
`pause_task(task_id)` SHALL set `status='paused'` on the task. `resume_task(task_id)` SHALL set `status='active'` and recompute `next_run` from the current time. Both SHALL return an error string if task_id not found.

#### Scenario: Pause stops task from running
- **WHEN** `pause_task("task-1")` called
- **THEN** task has `status='paused'`; poll loop skips it

#### Scenario: Resume recomputes next_run
- **WHEN** `resume_task("task-1")` called on a paused interval task
- **THEN** `status='active'`, `next_run` is now in the future (not stale from before pause)

#### Scenario: Pause on unknown task returns error
- **WHEN** `pause_task("nonexistent-id")` called
- **THEN** returns error string "Task not found: nonexistent-id"

### Requirement: update_task modifies schedule, prompt, or context_mode
`update_task(task_id, { schedule?, prompt?, context_mode? })` SHALL update the specified fields. If `schedule` changes, `next_run` SHALL be recomputed. Returns error if task not found.

#### Scenario: Schedule updated — next_run recomputed
- **WHEN** `update_task("task-1", { schedule: "every 2h" })` called
- **THEN** task has new `schedule_value`, `normalized_ms`, and recomputed `next_run`

#### Scenario: Prompt updated only
- **WHEN** `update_task("task-1", { prompt: "new prompt" })` called
- **THEN** task prompt updated; schedule and next_run unchanged

### Requirement: list_tasks returns human-readable rich output
`list_tasks()` SHALL return a JSON array of all tasks with: `id`, `prompt`, `schedule` (original human-friendly string), `scheduleType`, `status`, `nextRun` (relative, e.g. `"in 23 minutes"` or `"overdue"`), `lastResult` (truncated to 100 chars), `contextMode`, `createdAt`.

#### Scenario: Overdue task flagged
- **WHEN** a task's `next_run` is in the past and `status='active'`
- **THEN** list_tasks shows `nextRun: "overdue"` for that task

#### Scenario: Future task shows relative time
- **WHEN** a task's `next_run` is 23 minutes in the future
- **THEN** list_tasks shows `nextRun: "in 23 minutes"`
