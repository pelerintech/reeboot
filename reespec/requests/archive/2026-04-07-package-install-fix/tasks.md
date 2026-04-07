# Tasks: package-install-fix

## Task list

### 1. Rewrite packages.ts to delegate to pi's DefaultPackageManager

- [x] **RED** — In `tests/packages.test.ts` add: mock `DefaultPackageManager` from pi; call `installPackage('npm:test-ext')`; assert `pm.install` was called with `'npm:test-ext'`. Add second case: `uninstallPackage('test-ext')` → `pm.remove` called with `'test-ext'`. Add third case: `listPackages()` returns packages from `settingsManager.getGlobalSettings().packages`. Run `npm run test:run` → fails (current implementation uses spawnSync, not DefaultPackageManager).
- [x] **ACTION** — Rewrote `src/packages.ts`: imports `DefaultPackageManager`, `SettingsManager` from pi; delegates `installPackage` → `pm.install(spec)`, `uninstallPackage` → `pm.remove(name)`, `listPackages` → `settingsManager.getPackages()`. Removed all `spawnSync`/config.json logic. Also added `migratePackages` (covered by Task 2 tests in same file).
- [x] **GREEN** — `npm run test:run -- packages.test` → 10 tests passed.

---

### 2. Add migratePackages() — move legacy config.json packages to settings.json

- [x] **RED** — In `tests/packages.test.ts` add: write a temp `config.json` with `extensions.packages: ["npm:old-ext"]` and a temp `settings.json` without it; call `migratePackages(configPath, agentDir)`; assert `settings.json` now contains `"npm:old-ext"` and `config.json` no longer has `extensions.packages`. Run `npm run test:run` → fails (function didn't exist).
- [x] **ACTION** — `migratePackages(configPath, agentDir)` implemented in Task 1's rewrite: reads `config.extensions.packages`, merges new specs into `settingsManager.getPackages()`, calls `setPackages`, removes `extensions.packages` from config.json.
- [x] **GREEN** — `npm run test:run -- packages.test` → all 10 tests pass including 4 migratePackages cases.

---

### 3. Call migratePackages() at server startup

- [x] **RED** — Confirmed `migratePackages` not called in `server.ts` (grep returned nothing).
- [x] **ACTION** — In `src/server.ts`: added `import { migratePackages }` and called `await migratePackages(configPath, agentDir)` after `initContexts()`.
- [x] **GREEN** — `npm run build` exits 0. `npm run test:run` → 48 files, 484 tests passed.

---

### 4. Update CHANGELOG and bump version to 1.3.5

- [x] **RED** — N/A: already at 1.3.6 (multiple upgrades in same release). Changes added to existing [1.3.6] entry.
- [x] **ACTION** — Updated CHANGELOG.md [1.3.6] entry with package-install-fix items.
- [x] **GREEN** — CHANGELOG.md [1.3.6] contains package management entries.
