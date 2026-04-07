# Design: Upgrade cron-parser to v5

## Approach

Drop the CJS workaround entirely and migrate two files to the v5 ESM API.

### File 1 — `src/scheduler/parse.ts`

Remove the `createRequire` block (3 lines). Add a proper ESM import. Replace the two `parseExpression(expr)` calls:
- In `detectScheduleType`: validation call — `CronExpressionParser.parse(expr)` (still throws on invalid, same contract)
- In `computeNextRun`: `.next().toDate()` → `.next().value.toDate()`

### File 2 — `src/db/schema.ts`

Replace the default import (`import cronParser from 'cron-parser'`) with a named import (`import { CronExpressionParser } from 'cron-parser'`). Update the one call site: `cronParser.parseExpression(expr).next().toDate()` → `CronExpressionParser.parse(expr).next().value.toDate()`.

### Why `.next().value`?

v5 `.next()` returns an ES iterator result `{ value: CronDate, done: boolean }` instead of v4's custom date object. `.value.toDate()` extracts the JS `Date`.

### Verification strategy

`tests/scheduler-snippets.test.ts` imports the scheduler extension but doesn't exercise the parse functions directly. The existing `tests/scheduler.test.ts` exercises the scheduler end-to-end and indirectly covers `computeNextRun` via task scheduling. We add a focused unit test on `detectScheduleType` and `computeNextRun` from `parse.ts`, and on `runMigration` / `_computeMissingNextRuns` from `schema.ts`.

### Order

1. Bump package.json, install, confirm `tsc` fails on the old import style (RED)
2. Fix `parse.ts`
3. Fix `schema.ts`
4. All tests pass
