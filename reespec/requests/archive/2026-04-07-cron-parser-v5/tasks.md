# Tasks: Upgrade cron-parser to v5

---

### 1. Pin bump breaks the build (RED confirmation)

- [x] **RED** — In `package.json` change `"cron-parser": "^4.9.0"` to `"^5.5.0"`. Run `npm install && npm run build`. Assert `tsc` exits non-zero with errors related to the cron-parser import or call sites.
- [x] **ACTION** — No code changes yet. Confirms breakage is real.
- [x] **GREEN** — Build output contains errors in `parse.ts` and/or `schema.ts` related to `parseExpression` or the default import.

---

### 2. Fix parse.ts — drop createRequire hack, adopt CronExpressionParser

- [x] **RED** — Write `tests/scheduler/parse.test.ts`: import `detectScheduleType` and `computeNextRun` from `src/scheduler/parse.ts`. Assert: `detectScheduleType('0 * * * *')` returns `{ type: 'cron' }`; `detectScheduleType('not-a-cron')` throws; `computeNextRun({ schedule_type: 'cron', schedule_value: '0 * * * *', normalized_ms: null, next_run: null })` returns a string where `new Date(result) > new Date()`. Run `npm run test:run -- parse.test` → tests fail (parse.ts still uses old API, build broken).
- [x] **ACTION** — In `src/scheduler/parse.ts`: remove the `createRequire` block (lines 1-3 after the JSDoc). Add `import { CronExpressionParser } from 'cron-parser';`. Replace `parseExpression(trimmed)` (in `detectScheduleType`) with `CronExpressionParser.parse(trimmed)`. Replace `parseExpression(task.schedule_value).next().toDate()` (in `computeNextRun`) with `CronExpressionParser.parse(task.schedule_value).next().value.toDate()`.
- [x] **GREEN** — Run `npm run test:run -- parse.test` → all assertions pass. Run `npm run build` → no errors in `parse.ts`.

---

### 3. Fix schema.ts — named import and .next().value.toDate()

- [x] **RED** — Write `tests/db/schema-cron.test.ts`: open an in-memory `better-sqlite3` database, create a minimal `tasks` table with a row where `schedule_type='cron'`, `schedule_value='0 * * * *'`, `next_run=NULL`. Call `runMigration(db)`. Assert the row now has a non-null `next_run` value that parses as a valid future date. Run `npm run test:run -- schema-cron.test` → fails (schema.ts still uses old API).
- [x] **ACTION** — In `src/db/schema.ts`: replace `import cronParser from 'cron-parser'` with `import { CronExpressionParser } from 'cron-parser'`. Replace `cronParser.parseExpression(expr).next().toDate().toISOString()` with `CronExpressionParser.parse(expr).next().value.toDate().toISOString()`.
- [x] **GREEN** — Run `npm run test:run` → all tests pass including `schema-cron.test.ts` and the existing `tests/db/index.test.ts`. Run `npm run build` → exits 0.
