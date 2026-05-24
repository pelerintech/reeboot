# Spec — Bootstrap Server Jobs

## Capability

`src/bootstrap.ts` provides a single `bootstrapServerJobs(db, scheduler, config)` function that registers all background cron jobs. It is called by `server.ts` immediately after `setGlobalScheduler()`. Each extension that needs a background job exports a `registerServerJobs()` function.

## Scenarios

### GIVEN memory.enabled and memory.consolidation.enabled are both true
WHEN `bootstrapServerJobs(db, scheduler, config)` is called
THEN a task row with id `__memory_consolidation__` exists in the `tasks` table
AND the row has status `active`
AND the row has a non-null `next_run` computed from the configured cron schedule
AND `logger.info` was called describing the registration

### GIVEN memory.consolidation.enabled is false
WHEN `bootstrapServerJobs(db, scheduler, config)` is called
THEN no task row with id `__memory_consolidation__` exists in the `tasks` table

### GIVEN memory.enabled is false
WHEN `bootstrapServerJobs(db, scheduler, config)` is called
THEN no task row with id `__memory_consolidation__` exists in the `tasks` table

### GIVEN knowledge.enabled and knowledge.wiki.enabled are both true
WHEN `bootstrapServerJobs(db, scheduler, config)` is called
THEN a task row with id `__knowledge_lint__` exists in the `tasks` table
AND the row has status `active`
AND the row has a non-null `next_run`

### GIVEN knowledge.enabled is false
WHEN `bootstrapServerJobs(db, scheduler, config)` is called
THEN no task row with id `__knowledge_lint__` exists in the `tasks` table

### GIVEN bootstrapServerJobs is called twice (server restart)
WHEN both calls complete
THEN exactly one `__memory_consolidation__` row exists in the `tasks` table (idempotent)
AND the `next_run` from the first call is preserved (not reset)

### GIVEN a registerServerJobs call throws an error
WHEN bootstrapServerJobs runs
THEN the error is caught
AND `logger.error` is called with details
AND other jobs continue to register (failure is isolated)

### GIVEN the consolidation schedule is customised in config (e.g. '0 3 * * *')
WHEN bootstrapServerJobs is called
THEN the task row's `schedule_value` matches the configured schedule
AND `next_run` reflects that schedule, not the default '0 2 * * *'
