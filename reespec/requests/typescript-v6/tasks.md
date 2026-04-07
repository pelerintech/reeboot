# Tasks: Upgrade TypeScript to v6

---

### 1. Pin bump breaks the build (RED confirmation)

- [x] **RED** — In `package.json` change `"typescript": "^5.4.0"` to `"^6.0.2"`. Run `npm install && npm run build`. Assert `tsc` exits non-zero with type errors (expected: missing `process`, `Buffer`, `NodeJS.*` globals, or other TS 6 strictness errors).
- [x] **ACTION** — No code changes yet. This confirms the breakage before fixing it.
- [x] **GREEN** — Build output contains at least one type error, confirming TS 6 is active and the old config is insufficient. NOTE: tsc exited 0 immediately — no breakage occurred. TS 6.0.2 still auto-includes @types/node when present. Build was already clean.

---

### 2. Fix tsconfig — add types array

- [x] **RED** — Check: `tsconfig.json` does not contain `"types"` in `compilerOptions`. Assertion passes (the field is absent, confirming this is the gap).
- [x] **ACTION** — No change needed: `tsc` already exits 0 without `"types": ["node"]`. TS 6.0.2 auto-includes @types/node implicitly. tsconfig left unchanged.
- [x] **GREEN** — `tsc` exits 0 with no errors. No tsconfig change required.

---

### 3. Fix any remaining TS 6 type errors

- [x] **RED** — Run `npm run build` and collect all remaining type errors (if any from Task 2). Assert at least one error exists. If zero errors remain from Task 2, skip this task — mark all three steps done.
- [x] **ACTION** — No errors to fix. Zero remaining type errors after Tasks 1 & 2.
- [x] **GREEN** — `npm run build` exits 0. `npm run test:run` → 48 files, 483 tests passed. `npx tsx --version` → tsx v4.21.0.
