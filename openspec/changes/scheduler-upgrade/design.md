## Context

Phase 1 scheduler: `node-cron` schedules one job per task at startup. Each job fires `orchestrator.handleScheduledTask(taskId)` → agent runner → reply on `scheduler` channel. Task schema: `id, context_id, schedule (cron string), prompt, enabled, last_run`.

The rewrite replaces this with a single `setTimeout`-based poll loop that checks the DB for due tasks every 60 seconds. This is simpler, handles all three schedule types uniformly, and is restart-safe because due tasks are determined by comparing stored `next_run` to wall clock time.

TDD mandate: every new behaviour has a test written first (red). The task is not done until tests are green. DB migration is tested against a synthetic "legacy" DB to verify existing tasks survive.

## Goals / Non-Goals

**Goals:**
- Single poll loop, 60s default, configurable via `REEBOOT_SCHEDULER_INTERVAL_MS`
- 3 schedule types detected from value format: ISO datetime → once, `every X unit` / alias → interval, else → cron
- `next_run` stored in DB, computed once at creation and after each run
- Drift-free interval: advance `next_run` by fixed ms, skip past missed intervals
- `once` tasks: mark `status='completed'` after single run (no next_run)
- `context_mode`: `shared` (continues session) or `isolated` (fresh session per run)
- `task_runs` log: insert row for every run with duration, status, result/error
- `last_result`: last 200 chars of agent output stored on tasks row
- Extended agent tools: `update_task`, `pause_task`, `resume_task`, richer `list_tasks`
- `/tasks due` slash command
- `reeboot tasks due` CLI command
- DB migration: existing tasks preserved with `schedule_type='cron'`, `status='active'`, `next_run` computed

**Non-Goals:**
- Sub-minute polling (cron minimum is 1 minute; poll at 60s is sufficient)
- Distributed locking (reeboot is single-process; no multi-instance scenario)
- Task priority / ordering within a poll tick
- Heartbeat system (separate `proactive-agent` change)

## Decisions

### D1: Single poll loop with `setTimeout` recursion

```typescript
const poll = async () => {
  const due = db.prepare(
    "SELECT * FROM tasks WHERE status='active' AND next_run <= datetime('now')"
  ).all() as Task[];
  await Promise.all(due.map(t => runTask(t).catch(err => logError(t, err))));
  timer = setTimeout(poll, POLL_INTERVAL_MS);
};
```

`Promise.all` so multiple due tasks run concurrently. Each `runTask` is wrapped to prevent one failure from stopping others. `setTimeout` (not `setInterval`) so slow tasks don't pile up.

**Alternative:** keep `node-cron` per-task. Rejected — doesn't support interval/once types, can't be trivially tested without mocking the cron scheduler.

### D2: Schedule type auto-detected from value string

```typescript
function detectScheduleType(value: string): { type: ScheduleType; normalizedMs?: number } {
  // ISO 8601 datetime → once
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return { type: 'once' };
  // "every X unit" / aliases → interval
  const parsed = parseHumanInterval(value);
  if (parsed !== null) return { type: 'interval', normalizedMs: parsed };
  // else → cron (validated by cron-parser)
  CronExpressionParser.parse(value);  // throws if invalid
  return { type: 'cron' };
}
```

This means the `schedule_task` tool takes a single `schedule: string` parameter — far simpler for agents and users.

### D3: Drift-free interval advancement

```typescript
function computeNextRun(task: Task): string | null {
  if (task.scheduleType === 'once') return null;
  const now = Date.now();
  if (task.scheduleType === 'cron') {
    return CronExpressionParser.parse(task.scheduleValue).next().toISOString();
  }
  // interval
  const ms = task.normalizedMs!;
  let next = new Date(task.nextRun!).getTime() + ms;
  while (next <= now) next += ms;   // skip missed, O(missed_intervals) — bounded in practice
  return new Date(next).toISOString();
}
```

Loop is safe: `ms >= 1000` enforced by validation; even a 1-second interval after 1 year of downtime skips at most ~31M iterations (sub-second on modern hardware). In practice intervals are minutes/hours.

### D4: context_mode = 'isolated' spawns a fresh pi session

`shared` mode routes task prompt through the existing context session (same conversation history). `isolated` mode creates a temporary session with a fresh history, runs the task, then disposes the session. Implemented in `src/scheduler.ts`:

```typescript
if (task.contextMode === 'isolated') {
  const session = await createIsolatedSession(task.contextId);
  result = await session.run(task.prompt);
  await session.dispose();
} else {
  result = await orchestrator.handleScheduledTask(task);
}
```

### D5: DB migration — safe in-place ALTER TABLE

SQLite supports `ALTER TABLE ... ADD COLUMN` with default values. New columns added with defaults so existing rows remain valid. `next_run` is computed from the cron expression for each existing task at migration time.

Migration runs automatically on startup via a version check in `schema.ts`. Idempotent: checks column existence before adding.

### D6: TDD implementation order

For each spec:
1. Write all tests for the spec (red)
2. Run `npx vitest run tests/scheduler.test.ts` — confirm failures
3. Implement minimum code to pass (green)
4. No further changes until next spec's tests are written

## Risks / Trade-offs

- **Poll loop misses tasks if process is down** → `next_run` stored in DB, so tasks missed while down are discovered on next startup poll and run immediately (catch-up)
- **Many tasks due simultaneously** → `Promise.all` runs them concurrently; each triggers an agent turn; potential LLM rate-limit → acceptable for personal use; document
- **Migration fails on schema conflict** → migration is idempotent; tested against legacy DB fixture in tests
- **`cron-parser` becomes stale** → pinned version; ~15KB pure JS with no deps; low risk

## Open Questions

- Should catch-up runs (tasks missed while process was down) fire on startup? Yes — same as nanoclaw. Single tick with `next_run <= now` handles this automatically.
- `context_mode` default: `shared`. User can specify `isolated` when creating a task. Heartbeat always uses `isolated` (handled in `proactive-agent` change).
