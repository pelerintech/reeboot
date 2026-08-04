# CI fails on ERESOLVE — enforce zod 4 at root

## Problem

CI's `npm ci` fails with a hard `ERESOLVE` before any build/test runs:

```
npm error Could not resolve dependency:
npm error peer zod@"^4.0.0" from @tanstack/ai-anthropic@0.16.0
npm error Conflicting peer dependency: zod@4.4.3
```

Root cause (from discovery): an **upstream zod split inside the TanStack AI
ecosystem**. The provider adapters (`@tanstack/ai-anthropic/-openai/-groq`) all
declare `peer zod ^4.0.0` — on *every* published version — while the project pins
`zod ^3.25.76` at the root. Strict peer resolution cannot reconcile the two at the
same tree level, so `npm ci` hard-fails on a clean install. The local `node_modules`
works only because it is a pre-fabricated tree; a clean `npm ci` re-validates peers
and fails.

## Goal

Make a clean `npm ci` (the CI install step) succeed, and prove it locally before
pushing, so CI does not fail on something that was locally verifiable.

- Enforce **zod 4 at the root** (`zod ^4.4.3`) — resolves the ERESOLVE without
  disabling npm's peer-checking (no `legacy-peer-deps` / `--force`).
- Keep committing `package-lock.json` (regenerate it); the lock is not the problem.
- Verify locally, with the exact commands CI runs, before a commit is pushed:
  `npm ci` → `npm run build` → `npm run test:coverage` (the 80/80/80/72 gate).

## Non-goals

- **No Node version bump.** Node version is orthogonal to peer resolution, and
  nothing in the change requires a newer Node (zod 4 has no engine gate; `engines`
  stays `>=22`). Explicitly ruled out in discovery.
- **Not a permanent `legacy-peer-deps`** stance (loses npm's peer-check safety net).
- **Not fixing the upstream TanStack zod split** (core `@tanstack/ai` latest still
  pins `@ag-ui/core@^0.0.52` → zod 3; only we can smooth this over).
- **Not switching SDKs** (the decisions.md Vercel AI SDK fallback is *not* triggered).

## Impact

- `reeboot/package.json`: `zod` → `^4.4.3`; `reeboot/package-lock.json` regenerated.
- **Accepted side effect**: `@tanstack/ai` core declares *no* zod dep, so it inherits
  root zod 4 — the agent-loop tool/schema layer runs on zod 4 (likely fine: zod 4 has
  native Standard Schema support, which is what the tool layer is built around). This
  is the one genuine runtime risk and must be verified (see design).
- `@ag-ui/core` nests zod 3 under it (its only strict-zod-3 anchor) — contained.
- Own-code zod usage (`src/config.ts` only) uses vanilla APIs (`z.object/.string/
  .enum/.number/.boolean/.array`) — expected trivial or no migration.
- `.github/workflows/ci.yml`: Node 22 retained; optional npm-version parity.
- New local pre-push verification sequence (CI-parity).

## Confidence

High that the dependency tree resolves (verified peer/dep `zod` ranges for every
consumer). Medium on the `@tanstack/ai` core-on-zod-4 runtime behaviour — needs a real
clean install + running the ree loop, which the plan gates on.
