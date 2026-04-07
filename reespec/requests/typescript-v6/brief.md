# Brief: Upgrade TypeScript to v6

**Status:** Discovered  
**Date:** 2026-04-07

---

## Problem

`typescript` (devDependency) is on `^5.4.0`. TypeScript 6.0 is the latest major. It introduces several breaking changes and new compiler defaults, some of which require tsconfig adjustments. This is a devDependency upgrade — it affects build/type-checking only, not runtime behaviour.

---

## Breaking changes relevant to reeboot

### `types` array defaults to `[]` (was implicit `@types/**`)

**This is the most likely breakage.** In TS 5.x, if you don't set `types` in tsconfig, all installed `@types/*` packages are auto-included globally. In TS 6.0, `types` defaults to `[]` — only what you explicitly list.

Reeboot's `tsconfig.json` does **not** set `types`. It has `@types/node` and `@types/better-sqlite3` as devDependencies. The global Node.js types (`process`, `Buffer`, `__dirname`, etc.) are likely used throughout `src/`.

**Action:** Add `"types": ["node", "better-sqlite3"]` to `tsconfig.json` compilerOptions, OR verify that all usages of globals are covered by explicit imports.

### `outFile` removed

Reeboot doesn't use `outFile` (it compiles with `module: "NodeNext"` to individual files). **No action needed.**

### Stricter module resolution / `esModuleInterop` behaviour changes

TS 6 tightens some interop rules. The `allowSyntheticDefaultImports: true` + `esModuleInterop: true` combo reeboot uses should be fine, but needs a compile-time verification pass.

### Dev tooling compatibility

`vitest ^1.6` and `tsx ^4.7` are being used. Both need to support TS 6. Vitest 1.x used an older version of `@vitest/coverage-v8` and may have issues — however we're already upgrading vitest separately. `tsx` 4.7 should handle TS 6 (it strips types, doesn't type-check). Need to verify.

---

## Current tsconfig

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  }
}
```

No `types` or `typeRoots` set — this is the gap.

---

## Scope

1. Update `package.json`: `"typescript": "^5.4.0"` → `"^6.0.2"` (devDependency)
2. Add `"types": ["node"]` to `tsconfig.json` compilerOptions (covers `process`, `Buffer`, path globals etc.)
   - `@types/better-sqlite3` doesn't add globals — it's imported explicitly, so `types` array doesn't need to include it
3. Run `npm install`, `npm run build` — fix any new type errors that surface
4. Run `npm run test:run` — all tests must pass
5. Verify `tsx` still works for `npm run dev` (smoke check `tsx --version`)

---

## Dependency order note

This upgrade is independent of the pi and cron-parser upgrades. Can be done in any order. However, if TypeScript 6 surfaces type errors in files also touched by those upgrades (e.g. `pi-runner.ts`, `custom-compaction.ts`), it may be easier to do this one last to avoid merge conflicts.

---

## Out of scope

- Migrating to TS 6 native features (e.g. new decorator syntax, `using` keyword extensions).
- Upgrading `vitest` beyond what's needed for TS 6 compatibility (separate concern).
- `tsx` version bump (only needed if current `^4.7.0` breaks with TS 6).
