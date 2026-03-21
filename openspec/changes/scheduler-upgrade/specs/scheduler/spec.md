## MODIFIED Requirements

### Requirement: Scheduler uses poll loop and supports cron, interval, and once schedule types
The scheduler SHALL use a single poll loop (default 60s interval) instead of per-task cron jobs. It SHALL support three schedule types determined at task creation: `cron` (cron expression), `interval` (recurring every N ms), and `once` (fires at a specific datetime, then completes). All task execution SHALL dispatch through the orchestrator's `handleScheduledTask` method (unchanged dispatch path).

#### Scenario: Cron task fires on schedule
- **WHEN** a task has `schedule_type='cron'` and `next_run <= now`
- **THEN** task prompt is dispatched to agent runner via orchestrator

#### Scenario: Interval task fires every N ms
- **WHEN** a task has `schedule_type='interval'` and `next_run <= now`
- **THEN** task prompt dispatched; `next_run` advanced by `normalized_ms`

#### Scenario: Once task fires and is marked completed
- **WHEN** a task has `schedule_type='once'` and `next_run <= now`
- **THEN** task prompt dispatched; `status` set to `'completed'`

#### Scenario: Scheduler poll interval configurable
- **WHEN** `REEBOOT_SCHEDULER_INTERVAL_MS=30000` is set
- **THEN** poll loop runs every 30 seconds instead of 60
