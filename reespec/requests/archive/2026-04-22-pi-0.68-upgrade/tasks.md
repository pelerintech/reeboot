# Tasks: Pi 0.68 Upgrade

---

### 1. Bump pin to 0.68.1 and confirm clean build

- [x] **RED** — Check `grep '"@mariozechner/pi-coding-agent"' reeboot/package.json` → shows `0.65.2`. The assertion "pin is 0.68.1" is currently false.
- [x] **ACTION** — In `reeboot/package.json` change `"0.65.2"` to `"0.68.1"`. Run `npm install && npm run check` inside `reeboot/`. Also updated `tests/pi-version.test.ts` sentinel from `0.65.2` to `0.68.1`.
- [x] **GREEN** — `grep` now shows `0.68.1` and `npm run check` exits 0 (72 files, 674 passing).

---

### 2. mcp-manager skips disconnectAll on reload

- [x] **RED** — Write `reeboot/tests/extensions/mcp-reload.test.ts`: mount the mcp extension with a mock pi and a mock pool that has a `disconnectAll` spy. Fire `session_shutdown` with `{ reason: "reload" }`. Assert `disconnectAll` was NOT called. Fire again with `{ reason: "quit" }`. Assert `disconnectAll` WAS called. Run `npm run test:run -- mcp-reload` → fails because the guard does not exist yet.
- [x] **ACTION** — In `reeboot/src/extensions/mcp-manager.ts`, add `if (event.reason === "reload") return;` at the top of the `session_shutdown` handler body.
- [x] **GREEN** — Run `npm run test:run -- mcp-reload` → passes (3/3).

---

### 3. scheduler-tool skips clearAll on reload

- [x] **RED** — Write `reeboot/tests/extensions/scheduler-reload.test.ts`: mount the scheduler extension with a mock pi. Spy on `TimerManager.prototype.clearAll`. Fire `session_shutdown` with `{ reason: "reload" }`. Assert `clearAll` was NOT called. Fire with `{ reason: "quit" }`. Assert `clearAll` WAS called. Run `npm run test:run -- scheduler-reload` → fails.
- [x] **ACTION** — In `reeboot/src/extensions/scheduler-tool.ts`, add `if (event.reason === "reload") return;` at the top of the `session_shutdown` handler body.
- [x] **GREEN** — Run `npm run test:run -- scheduler-reload` → passes (2/2).

---

### 4. skill-manager skips clearInterval on reload

- [x] **RED** — Write `reeboot/tests/extensions/skill-manager-reload.test.ts`: spy on the global `clearInterval`. Mount the skill-manager extension with a mock pi and config. Fire `session_shutdown` with `{ reason: "reload" }`. Assert `clearInterval` was NOT called. Fire with `{ reason: "quit" }`. Assert `clearInterval` WAS called. Run `npm run test:run -- skill-manager-reload` → fails.
- [x] **ACTION** — In `reeboot/src/extensions/skill-manager.ts`, add `if (event.reason === "reload") return;` at the top of the `session_shutdown` handler body.
- [x] **GREEN** — Run `npm run test:run -- skill-manager-reload` → passes (2/2).

---

### 5. entrypoint.sh exports PI_CACHE_RETENTION=long

- [x] **RED** — Check `grep PI_CACHE_RETENTION reeboot/container/entrypoint.sh` → no match. Assertion "entrypoint sets PI_CACHE_RETENTION=long" is currently false.
- [x] **ACTION** — Add `export PI_CACHE_RETENTION=long` to `reeboot/container/entrypoint.sh` after the existing host variable exports and before the first `exec` call.
- [x] **GREEN** — `grep PI_CACHE_RETENTION reeboot/container/entrypoint.sh` → shows `export PI_CACHE_RETENTION=long`.

---

### 6. Daemon generators include PI_CACHE_RETENTION=long

- [x] **RED** — In `reeboot/tests/daemon.test.ts`, add two assertions: `generatePlist(...)` output contains `PI_CACHE_RETENTION` and `generateSystemdUnit(...)` output contains `Environment=PI_CACHE_RETENTION=long`. Run `npm run test:run -- daemon` → the new assertions fail because neither generator sets the variable yet.
- [x] **ACTION** — In `reeboot/src/daemon.ts`: add an `<EnvironmentVariables>` dict with `PI_CACHE_RETENTION` → `long` to `generatePlist()`. Add `Environment=PI_CACHE_RETENTION=long` to the `[Service]` section of `generateSystemdUnit()`.
- [x] **GREEN** — Run `npm run test:run -- daemon` → all assertions pass (11/11).

---

### 7. Doctor reports context files check

- [x] **RED** — In `reeboot/tests/doctor.test.ts`, add a test: call `runDoctor({ configPath, reebotDir: tmpDir, cwd: tmpDir, skipNetwork: true })`. Assert the results array includes an entry with `name === "Context files"`. Run `npm run test:run -- doctor` → fails because the check does not exist yet.
- [x] **ACTION** — In `reeboot/src/doctor.ts`: import `loadProjectContextFiles` from `@mariozechner/pi-coding-agent`. Add `checkContextFiles(reebotDir, cwd)` that calls it and returns a `CheckResult` (pass with file list if found, warn with fix hint if none, warn on error). Add `cwd` option to `DoctorOptions` (default `process.cwd()`). Call the new check inside `runDoctor()`.
- [x] **GREEN** — Run `npm run test:run -- doctor` → all assertions pass (11/11). Full suite: 75 files, 684 passing.
