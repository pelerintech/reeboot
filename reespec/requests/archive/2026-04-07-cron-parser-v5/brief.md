# Brief: Upgrade cron-parser to v5

**Status:** Discovered  
**Date:** 2026-04-07

---

## Problem

`cron-parser` is on `^4.9.0` (CJS module). v5 is a full TypeScript rewrite and native ESM package with a new API. Reeboot currently uses a `createRequire` hack to CJS-import `parseExpression` from v4 — a workaround that can be dropped with v5.

---

## Breaking changes that hit reeboot

### Import API changed

v4: default export is the module; `parseExpression` is a named CJS export.  
v5: exports `CronExpressionParser` class with a static `.parse()` method.

```ts
// v4 (current — with CJS hack)
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { parseExpression } = _require('cron-parser');
parseExpression('0 * * * *').next().toDate()

// v4 (also current — in schema.ts)
import cronParser from 'cron-parser';
cronParser.parseExpression('0 * * * *').next().toDate()

// v5
import { CronExpressionParser } from 'cron-parser';
CronExpressionParser.parse('0 * * * *').next().value.toDate()
```

### `.next()` return type changed

v4: `interval.next()` returns a `Date`-like object; `.toDate()` works directly.  
v5: `interval.next()` returns an iterator result `{ value: CronDate, done: boolean }`; must use `.next().value.toDate()`.

### `utc` option removed

v4: `parseExpression(expr, { utc: true })` — reeboot does **not** pass this option, so no change needed.

### `interval.fields` type changed

v4: plain array. v5: readonly `CronFieldsCollection`. Reeboot does **not** read `.fields` anywhere, so no change needed.

---

## Affected files

| File | Current usage | Change needed |
|---|---|---|
| `src/scheduler/parse.ts` | `createRequire` hack + `parseExpression(expr)` | Drop hack, use `CronExpressionParser.parse(expr)`, fix `.next()` call |
| `src/db/schema.ts` | `import cronParser from 'cron-parser'` + `cronParser.parseExpression(expr).next().toDate()` | Switch to `CronExpressionParser.parse`, fix `.next().value.toDate()` |

---

## Scope

1. Update `package.json`: `"cron-parser": "^4.9.0"` → `"^5.5.0"`
2. Fix `src/scheduler/parse.ts`:
   - Remove `createRequire` import and hack
   - Import `{ CronExpressionParser }` from `'cron-parser'`
   - Replace `parseExpression(expr)` with `CronExpressionParser.parse(expr)`
   - Fix `.next().toDate()` → `.next().value.toDate()` where used
3. Fix `src/db/schema.ts`:
   - Replace `import cronParser from 'cron-parser'` with `import { CronExpressionParser } from 'cron-parser'`
   - Replace `cronParser.parseExpression(expr).next().toDate()` with `CronExpressionParser.parse(expr).next().value.toDate()`
4. Run `npm install`, `npm run build`, `npm run test:run` — all must pass
5. Check smoke tests cover the cron path (they do via `src/db/schema.ts` in `tests/smoke.test.ts`)

---

## Out of scope

- Natural language schedule parsing logic in `parse.ts` — no change needed, it only uses cron-parser for validation and next-run computation.
- `utc`, `fields`, or `CronFileParser` — not used by reeboot.
