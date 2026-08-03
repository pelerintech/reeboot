# Capability: local CI parity / pre-push verification

Every CI step that can be verified locally is verified locally with the exact command
CI runs, before a commit is pushed — so a commit does not fail CI on something that
was locally checkable.

## Scenario: CI install step is locally replicated

- **GIVEN** a fresh npm cache directory (bypassing any broken default cache)
- **WHEN** `npm ci --cache <fresh-dir>` runs locally in `reeboot/`
- **THEN** it reproduces the true CI resolution result (succeeds after the fix; and,
  before the fix, it reproduced the exact ERESOLVE)

## Scenario: CI build + coverage gate are locally replicated

- **GIVEN** the post-fix tree
- **WHEN** `npm run build` then `npm run test:coverage` run locally
- **THEN** build exits 0 and `test:coverage` passes including the 80/80/80/72
  coverage thresholds (the exact gate CI enforces)

## Scenario: CI-only steps are identified and consciously handled

- **GIVEN** the CI `test` job also runs a Codecov upload (needs a secret token)
- **THEN** it is recognised as not locally reproducible and its pass/fail is
  understood to depend only on tests passing, not on code correctness
- **AND** the npm-version drift between CI (npm ~10 with Node 22) and local (npm 11)
  is documented or pinned so it does not cause a surprise CI failure

## Scenario: pre-push verification sequence exists

- **GIVEN** a documented pre-push sequence (fresh-cache `npm ci` → build →
  `test:coverage`)
- **THEN** it is committed and runnable, and the full sequence is green from a clean
  state before a commit is pushed
