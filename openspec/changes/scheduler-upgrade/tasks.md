## 1. Dependencies & Test Infrastructure (RED — all failing tests first)

- [x] 1.1 Add `cron-parser` to `package.json` dependencies
- [x] 1.2 Write failing tests for schedule-parser: all `detectScheduleType` cases (ISO → once, aliases, `every N unit`, cron, invalid throws), all `computeNextRun` cases (once → null, cron next occurrence, interval drift-free skip)
- [x] 1.3 Write failing tests for task-poll-loop: due task dispatched, non-due skipped, paused skipped, completed skipped, multiple concurrent, one failure doesn't block others, once → completed, next_run updated (cron + interval drift-free), DB migration from Phase 1 schema
- [x] 1.4 Write failing tests for task-run-log: success row inserted, failure row inserted, result truncated to 200 chars, last_result on tasks updated
- [x] 1.5 Write failing tests for task-management-tools: schedule_task with interval/cron/once/invalid, context_mode stored, pause/resume/update_task, unknown id returns error, list_tasks overdue flag, relative next_run format
- [x] 1.6 Write failing tests for tasks-due-command: /tasks due with overdue tasks, /tasks due nothing overdue, /tasks lists all active, reeboot tasks due CLI output, CLI nothing overdue

## 2. Schedule Parser (GREEN)

- [x] 2.1 Implement `parseHumanInterval(s)` in `src/scheduler/parse.ts` — aliases + `every N unit` → ms, returns null if no match; ensure interval scenarios in 1.2 pass
- [x] 2.2 Implement `detectScheduleType(value)` — ISO → once, human interval → interval, else → cron (validated via cron-parser); ensure all detectScheduleType scenarios in 1.2 pass
- [x] 2.3 Implement `computeNextRun(task)` — null for once, cron-parser for cron, drift-free for interval; ensure all computeNextRun scenarios in 1.2 pass

## 3. DB Schema Migration (GREEN)

- [x] 3.1 Add migration to `db/schema.ts`: add columns `schedule_type`, `schedule_value`, `normalized_ms`, `status`, `next_run`, `last_result`, `context_mode` to tasks; create `task_runs` table; ensure migration is idempotent (column existence check)
- [x] 3.2 Write and run migration against a synthetic legacy DB in tests; ensure 1.3 migration scenarios pass

## 4. Poll Loop Rewrite (GREEN)

- [x] 4.1 Rewrite `src/scheduler.ts`: remove node-cron per-task registrations, implement single `setTimeout` poll loop; query due tasks from DB; dispatch via existing `orchestrator.handleScheduledTask()`; ensure due/skipped/concurrent scenarios in 1.3 pass
- [x] 4.2 Implement `runTask(task)` in scheduler: dispatch, measure duration, write `task_runs` row, update `last_result` and `next_run` on tasks; handle `once` → set status completed; ensure 1.3 and 1.4 scenarios pass
- [x] 4.3 Update `src/scheduler-registry.ts` to expose `start()` / `stop()` for the poll loop; ensure poll can be stopped cleanly in tests

## 5. Agent Tools Upgrade (GREEN)

- [x] 5.1 Update `schedule_task` tool in `extensions/scheduler-tool.ts`: single `schedule` string param, call `detectScheduleType()`, validate, store with new schema fields; ensure 1.5 schedule_task scenarios pass
- [x] 5.2 Add `pause_task` tool; ensure 1.5 pause scenarios pass
- [x] 5.3 Add `resume_task` tool — recomputes next_run on resume; ensure 1.5 resume scenarios pass
- [x] 5.4 Add `update_task` tool — updates prompt/schedule/context_mode, recomputes next_run if schedule changed; ensure 1.5 update scenarios pass
- [x] 5.5 Update `list_tasks` tool — returns richer data (relative next_run, overdue flag, last_result); ensure 1.5 list scenarios pass

## 6. Commands (GREEN)

- [x] 6.1 Register `/tasks` slash command in `extensions/scheduler-tool.ts` with `due` subcommand; ensure 1.6 /tasks scenarios pass
- [x] 6.2 Add `reeboot tasks due` CLI subcommand in `src/index.ts`; ensure 1.6 CLI scenarios pass

## 7. Integration & Cleanup

- [x] 7.1 Run full test suite — all 1.2–1.6 tests must be green; no regressions in existing scheduler tests
- [x] 7.2 Remove `node-cron` from `package.json` if no longer used elsewhere
- [x] 7.3 Manual smoke test: create a task with `"every 1m"` via agent tool, wait 2 poll ticks, verify `task_runs` has 2 entries in the DB
- [x] 7.4 Manual smoke test: create a `once` task 2 minutes in the future, wait for it to fire, verify `status='completed'` in DB
