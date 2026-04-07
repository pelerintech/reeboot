# Design: Upgrade TypeScript to v6

## Approach

One-line tsconfig change + pin bump. If new type errors surface, fix them. No src logic changes expected.

### The one required tsconfig change

TS 6 defaults `types` to `[]`. Reeboot's source uses `process`, `Buffer`, and `NodeJS.*` types pervasively without explicit imports — these come from `@types/node` globals. Without `"types": ["node"]` in tsconfig, every file that references `process`, `Buffer`, `NodeJS.Timeout` etc. will produce a type error.

`@types/better-sqlite3` doesn't contribute globals — it's always imported explicitly as `import type Database from 'better-sqlite3'`. No need to add it to the `types` array.

### Unknown surface area

TS 6 tightens several things (`esModuleInterop`, stricter generics, deprecation of some compiler API surfaces). The actual error count after adding `"types": ["node"]` is unknown until we run `tsc`. The task structure accounts for this: Task 2 (fix tsconfig) may reveal additional errors that become Task 3 (fix remaining type errors).

### Verification strategy

The build is the test. `npm run build` running clean is the only meaningful assertion for a devDependency-only upgrade. The existing test suite (`npm run test:run`) must also continue to pass — vitest 1.6 under `bun:node` is known to work with TS 6 source files since vitest uses `tsx` to strip types, not `tsc`.

### Order

1. Bump `typescript` pin, `npm install`, confirm `tsc` fails (RED)
2. Add `"types": ["node"]` to tsconfig — run `tsc` again
3. Fix any remaining type errors surfaced by TS 6
4. Full test run passes
