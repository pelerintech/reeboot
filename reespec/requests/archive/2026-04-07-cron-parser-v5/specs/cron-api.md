# Spec: cron-parser v5 API

## Capability 1 — detectScheduleType validates cron expressions

GIVEN a valid cron expression like `"0 * * * *"`  
WHEN `detectScheduleType` is called  
THEN it returns `{ type: 'cron' }` without throwing

GIVEN an invalid cron expression like `"not-a-cron"`  
WHEN `detectScheduleType` is called  
THEN it throws with a message containing "invalid schedule"

## Capability 2 — computeNextRun returns a future ISO string for cron tasks

GIVEN a task with `schedule_type: 'cron'` and `schedule_value: '0 * * * *'`  
WHEN `computeNextRun` is called  
THEN it returns an ISO 8601 string representing a time in the future

## Capability 3 — schema migration computes next_run for legacy cron rows

GIVEN a SQLite DB with a tasks row where `schedule_type='cron'` and `next_run IS NULL`  
WHEN `runMigration` is called  
THEN the row's `next_run` column is populated with a future ISO 8601 string

## Capability 4 — build is clean

GIVEN all source changes are applied  
WHEN `npm run build` runs  
THEN `tsc` exits 0 with no errors
