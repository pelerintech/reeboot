# Tasks: package-install-fix

## Task list

### 1. Rewrite packages.ts to delegate to pi's DefaultPackageManager

- [ ] **RED** — In `tests/packages.test.ts` add: mock `DefaultPackageManager` from pi; call `installPackage('npm:test-ext')`; assert `pm.install` was called with `'npm:test-ext'`. Add second case: `uninstallPackage('test-ext')` → `pm.remove` called with `'test-ext'`. Add third case: `listPackages()` returns packages from `settingsManager.getGlobalSettings().packages`. Run `npm run test:run` → fails (current implementation uses spawnSync, not DefaultPackageManager).
- [ ] **ACTION** — Rewrite `src/packages.ts`: import `DefaultPackageManager`, `SettingsManager` from pi; build `pm = new DefaultPackageManager({ agentDir: ~/.reeboot/agent/, settingsManager, cwd })` in each function; call `pm.install(spec)`, `pm.remove(name)`, `pm.resolve()` for list. Remove old `spawnSync` / `--prefix packages/` logic.
- [ ] **GREEN** — Run `npm run test:run` → all pass.

---

### 2. Add migratePackages() — move legacy config.json packages to settings.json

- [ ] **RED** — In `tests/packages.test.ts` add: write a temp `config.json` with `extensions.packages: ["npm:old-ext"]` and a temp `settings.json` without it; call `migratePackages(configPath, agentDir)`; assert `settings.json` now contains `"npm:old-ext"` and `config.json` no longer has `extensions.packages`. Run `npm run test:run` → fails (function doesn't exist).
- [ ] **ACTION** — Add `migratePackages(configPath, agentDir)` to `src/packages.ts`: read `config.extensions.packages`; for each spec, if not already in `settings.json` packages, add it via `SettingsManager`; then remove `config.extensions.packages` from config and save.
- [ ] **GREEN** — Run `npm run test:run` → all pass.

---

### 3. Call migratePackages() at server startup

- [ ] **RED** — In `tests/packages.test.ts` add: write a config.json with legacy packages, call `startServer()` (mocked), assert `migratePackages` was called during startup. Alternatively: write a temp config with legacy packages, run the migration directly, assert the output state. Run `npm run test:run` → fails.
- [ ] **ACTION** — In `src/server.ts`: after `initContexts()`, call `migratePackages(configPath, reebotDir)`. Import from `./packages.js`.
- [ ] **GREEN** — Run `npm run test:run` → all pass.

---

### 4. Update CHANGELOG and bump version to 1.3.5

- [ ] **RED** — Check: `CHANGELOG.md` does not contain `[1.3.5]`. `package.json` version is `1.3.4`. Both assertions pass.
- [ ] **ACTION** — Bump `reeboot/package.json` to `1.3.5`. Add `## [1.3.5]` entry to `CHANGELOG.md` covering: package install/uninstall now delegates to pi's DefaultPackageManager, packages listed in `~/.reeboot/agent/settings.json`, migration from legacy `config.json` packages.
- [ ] **GREEN** — `package.json` version is `1.3.5`. `CHANGELOG.md` contains `[1.3.5]`.
