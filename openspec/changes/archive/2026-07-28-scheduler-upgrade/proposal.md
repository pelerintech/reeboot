## Why

Phase 1's scheduler supports only cron expressions via `node-cron`, with one job registered per task at startup. This means users cannot say "remind me every 30 minutes" or "send this report once on Friday" — only raw cron strings work, which are opaque to non-technical users. There is also no task run history, no way to pause a task, no stored next-run time (making restart behaviour unpredictable), and no drift prevention for interval tasks. The single-job-per-task model also has more failure surface than a single poll loop.

## What Changes

- `src/scheduler.ts` rewritten: single poll loop (60s) replaces per-task `node-cron` jobs
- Task model extended: `schedule_type` (cron/interval/once), `schedule_value`, `status` (active/paused/completed), `next_run` (stored ISO timestamp), `last_result`, `context_mode` (shared/isolated)
- New `task_runs` table: full run history with `run_at`, `duration_ms`, `status`, `result`, `error`
- Human-friendly schedule parsing: `"hourly"`, `"daily"`, `"every 30m"`, `"every 2h"` — no cron knowledge required; schedule type auto-detected from value format
- `schedule_task` tool: single `schedule` string parameter (auto-detected type), replaces separate type + value
- New tools: `update_task`, `pause_task`, `resume_task`; `list_tasks` returns richer data (relative next_run, overdue flag, last_result)
- New `/tasks` slash command with `due` subcommand showing overdue tasks
- `reeboot tasks due` CLI command
- Drift-free interval: `next_run` stored and advanced by fixed interval, not recomputed from wall clock
- DB migration: existing cron tasks get `schedule_type='cron'`, `status='active'`, `next_run` computed from schedule expression
- All changes follow TDD red/green: failing tests written before each implementation
- New npm dep: `cron-parser` (~15KB pure JS) for computing next-run from cron expressions

## Capabilities

### New Capabilities
- `schedule-parser`: human-friendly schedule string parser (`"every 30m"` → interval ms, `"0 9 * * *"` → cron, ISO → once)
- `task-poll-loop`: single 60s poll loop replacing per-task node-cron jobs; handles all 3 schedule types, drift-free
- `task-run-log`: `task_runs` table storing full run history per task
- `task-management-tools`: extended agent tools (update_task, pause_task, resume_task, richer list_tasks)
- `tasks-due-command`: `/tasks due` in-chat command and `reeboot tasks due` CLI listing overdue tasks

### Modified Capabilities
- `scheduler`: cron-only → poll loop with 3 schedule types, stored next_run, richer task model

## Impact

- `src/scheduler.ts`: full rewrite
- `src/scheduler-registry.ts`: minor update to expose start/stop
- `db/schema.ts`: 5 new columns on tasks, new task_runs table, migration script
- `extensions/scheduler-tool.ts`: new tools, richer list_tasks, /tasks command
- `src/index.ts`: new `tasks due` subcommand
- `config.ts`: no change (heartbeat config deferred to proactive-agent change)
- `tests/scheduler.test.ts`: full rewrite (TDD first)
- New npm dep: `cron-parser`
