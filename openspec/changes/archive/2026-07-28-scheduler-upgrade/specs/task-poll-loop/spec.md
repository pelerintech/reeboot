## ADDED Requirements

### Requirement: Scheduler uses single poll loop checking next_run
The scheduler SHALL run a single poll loop with a configurable interval (default 60s, overridable via `REEBOOT_SCHEDULER_INTERVAL_MS`). Each poll SHALL query `tasks WHERE status='active' AND next_run <= datetime('now')` and run all due tasks concurrently. One task failing SHALL NOT prevent other due tasks from running.

#### Scenario: Due task is run on poll
- **WHEN** a task has `status='active'` and `next_run` is in the past
- **THEN** task prompt is dispatched to the agent runner on the next poll

#### Scenario: Non-due task is not run
- **WHEN** a task has `status='active'` and `next_run` is 10 minutes in the future
- **THEN** task is not run on this poll

#### Scenario: Paused task is not run
- **WHEN** a task has `status='paused'`
- **THEN** task is skipped even if `next_run <= now`

#### Scenario: Completed task is not run
- **WHEN** a task has `status='completed'`
- **THEN** task is never run by the poll loop

#### Scenario: Multiple due tasks run concurrently
- **WHEN** 3 tasks are due simultaneously
- **THEN** all 3 are dispatched in the same poll tick (not sequentially)

#### Scenario: One failing task does not block others
- **WHEN** task A throws an error during run and tasks B and C are also due
- **THEN** B and C still run; A's error is logged

### Requirement: once tasks marked completed after single run
After a `schedule_type = 'once'` task runs, its status SHALL be set to `'completed'` and it SHALL NOT appear in subsequent polls.

#### Scenario: once task runs once
- **WHEN** a `once` task fires
- **THEN** after the run, `status = 'completed'`
- **THEN** next poll does not run it again

### Requirement: next_run updated after each run
After any task run (cron or interval), `next_run` SHALL be updated to the next future timestamp. `last_run` SHALL be updated to the run time.

#### Scenario: Cron task next_run advanced
- **WHEN** a cron task fires
- **THEN** `next_run` is updated to the next cron-expression occurrence after now

#### Scenario: Interval task next_run drift-free
- **WHEN** an interval task fires late (was due 10 minutes ago, interval is 1 hour)
- **THEN** `next_run` is set to `stored_next + 1h`, not `now + 1h`

### Requirement: DB migration preserves existing tasks
On startup, if the tasks table lacks the new columns, the scheduler SHALL run a migration that adds the new columns with defaults: `schedule_type='cron'`, `status='active'`, `context_mode='shared'`. `next_run` SHALL be computed from the existing `schedule` cron string.

#### Scenario: Legacy task survives migration
- **WHEN** DB has a task with only Phase 1 columns (no schedule_type, status, next_run)
- **THEN** after migration, task has `schedule_type='cron'`, `status='active'`, valid `next_run`
- **THEN** task fires correctly on next poll
