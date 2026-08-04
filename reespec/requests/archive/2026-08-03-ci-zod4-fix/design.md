# ci-zod4-fix — design

## Overview

The ERESOLVE is an upstream zod split. We resolve it by moving the project's root
zod to v4, accept the contained side effects, and prove the whole CI sequence locally
before pushing.

## The dependency problem (evidence)

Verified on the registry and installed tree:

```
@tanstack/ai (core)      → depends on @ag-ui/core@^0.0.52  → dep zod ^3.22.4
                              AND uses zod at runtime (tool-definition, schema-converter)
                              but declares NO zod dep of its own → inherits ROOT zod
@tanstack/ai-anthropic   → peer zod ^4.0.0 (every version; 0 zod refs in compiled output)
@tanstack/ai-openai      → peer zod ^4.0.0 (every version; 0 zod refs in compiled output)
@tanstack/ai-groq        → peer zod ^4.0.0
@anthropic-ai/sdk        → peer zod ^3.25.0 || ^4.0.0   (accepts 4)
openai                   → peer zod ^3.25 || ^4.0        (accepts 4)
@modelcontextprotocol/sdk→ dep zod ^3.25 || ^4.0         (accepts 4)
zod-to-json-schema       → peer zod ^3.25.28 || ^4        (accepts 4)
```

Only `@ag-ui/core` requires *strictly* zod 3, and only as a **regular dependency**
(so it nests zod 3 under itself). All peer consumers accept zod 4.

## Chosen approach: zod 4 at root

Bump `reeboot/package.json` → `"zod": "^4.4.3"` and regenerate the lock. Resulting tree:

```
node_modules/zod                        → zod 4.4.3   (root + adapters + all ^3||^4 peers)
node_modules/@ag-ui/core/node_modules/zod → zod 3       (nested, satisfies its ^3.22.4)
```

- `npm ci` resolves with strict peer-checking **on** (no `--legacy-peer-deps`,
  no `--force`, no global `overrides`).
- Rejected alternatives:
  - **`legacy-peer-deps` / `.npmrc`** — disables peer-checking app-wide; masks any
    future *real* peer conflict. Rejected by human (not forward-looking enough).
  - **Bump Node** — orthogonality: peer resolution is unaffected by Node version;
    verified zod4 has no engine gate, so no forcing reason. Explicitly dropped.
  - **De-scope the zod-4 adapters** — they're genuinely wired (anthropic/groq/openai
    providers in `ree-runtime.ts`), so not droppable.

## Accepted risk: `@tanstack/ai` core runs on zod 4

Because core declares no zod, Node resolves its `import 'zod'` to the root = zod 4.
This migrates the agent loop's tool/schema layer (`tool-definition`,
`schema-converter`) onto zod 4. Rationale it should be fine: zod 4 natively
implements `@standard-schema/spec`, which the tool layer is built around — this is
likely why the adapters began demanding `^4.0.0`. **Mitigation**: a dedicated guard
test drives the ree loop's tool-schema path under zod 4 (task 3). If it genuinely
breaks, fall back is `legacy-peer-deps` + zod 3 — but that is a last resort, not the
plan.

## CI parity & local replication

CI sequence (the `test` job): `npm ci` → `npm run build` → `npm run test:coverage`
(which enforces 80/80/80/72) → Codecov upload.

Locally replicable now that the sandbox's broken `~/.npm` cache is bypassed via a
fresh `--cache <dir>` (verified: `npm ci --cache <fresh-dir>` reproduces the exact
ERESOLVE). Steps we can and must replicate before push:

| CI step | Local command |
|---|---|
| Install | `npm ci --cache <fresh-dir>` (fresh cache) |
| Build | `npm run build` (tsc) |
| Test + gate | `npm run test:coverage` (enforces 80/80/80/72) |

Two **inherently CI-only** items, not locally gated:
1. **Codecov upload** — made **best-effort / non-blocking** in the workflow:
   skipped when `CODECOV_TOKEN` is unset (common for protected branches / fork
   PRs, where upload errors with "Token required") and set to
   `fail_ci_if_error: false` + `continue-on-error: true` so it can never block the
   pipeline. Verified locally only insofar as tests pass.
2. **npm version drift** — CI `setup-node@22` ships npm 10.x; local is 11.16.0. Both
   resolve identically on lock v3, but we pin/document parity to avoid drift surprises.

Sandbox caveat: `test:coverage` may surface a small number of sandbox-only failures
(e.g. leftover `~/.reeboot` EPERM, external-subprocess suites). Reading failures to
distinguish sandbox-only vs real regression is part of the gate, not just counting
red/green.

## Open risk

- **`@tanstack/ai` core on zod 4 runtime behaviour** — the one genuine unknown,
  gated by task 3 and by task 5 (full coverage) under the new tree.

## Post-implementation findings (first real CI run)

Unblocking `npm ci` let the GH Actions pipeline reach the test phase **for the first
time**, exposing two pre-existing latent failures (neither zod-related):

1. **`tests/package.test.ts`** required `webchat/dist/` to exist on disk — a gitignored
   Vite artifact never built by CI — so a fresh checkout failed. Fixed by splitting the
   `files`-whitelist membership assertion from the on-disk source-layout check.
2. **Unconditional `program.parse()` at module load** (`src/index.ts`) executed the CLI
   against the real default config path on import; on a runner with no
   `~/.reeboot/config.json` it fired 9 unhandled `process.exit(1)` rejections. Fixed by
   guarding `parse()` to run only when the module is the direct entrypoint.

Both were reproduced locally by simulating the fresh runner (CI-like `HOME`, no
`~/.reeboot/config.json`) and are fixed. Full verification under that condition:
`npm run build` exit 0; `npm run test:coverage` exit 0 (285 files / 1862 tests, coverage
81.42% / 76.14% / 81.67% / 81.42%, gate met) with **0** `process.exit` errors.
The Codecov upload step is best-effort: skipped when no token is configured and
non-blocking (`fail_ci_if_error: false`, `continue-on-error: true`).
