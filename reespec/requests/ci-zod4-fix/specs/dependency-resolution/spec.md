# Capability: dependency resolution

`npm ci` must install cleanly with zod 4 at the root and npm's strict peer-checking
enabled — no `--legacy-peer-deps`, `--force`, or global overrides.

## Scenario: clean install resolves the zod peer split

- **GIVEN** `reeboot/package.json` declares `"zod": "^4.4.3"` and a regenerated
  `package-lock.json`, and no leniency flags are set
- **WHEN** a clean `npm ci --cache <fresh-dir>` runs in `reeboot/`
- **THEN** it exits with code 0 and installs `node_modules`
- **AND** `npm ls zod` reports a single top-level `zod@4.4.3`
- **AND** `node_modules/@ag-ui/core/node_modules/zod` is installed (zod 3 nested)

## Scenario: lockfile is committed and reproducible

- **GIVEN** the re-generated lockfile is added to the repo
- **WHEN** `npm ci` runs from a clean state in CI and locally
- **THEN** both succeed with the same resolved versions (lock v3, deterministic)

## Scenario: strict peer checking remains enabled

- **GIVEN** the installed tree after the fix
- **THEN** no `.npmrc` `legacy-peer-deps`, no `--force`/`--legacy-peer-deps` flag is
  used for `npm ci`, and `npm ls` reports no `invalid` peer states
