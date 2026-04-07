# Tasks: agent-isolation

## Task list

### 1. Add authMode to config schema and loadConfig

- [x] **RED** — In `tests/config.test.ts` add: assert `loadConfig()` on a config with `authMode: "pi"` returns `agent.model.authMode === "pi"`; assert a config without `authMode` defaults to `"own"`; assert `authMode: "own"` preserves provider/model/apiKey. Run `npm run test:run` → tests fail (field doesn't exist).
- [x] **ACTION** — In `src/config.ts`: add `authMode: z.enum(["pi", "own"]).default("own")` to `ModelConfigSchema`. Update `defaultConfig` accordingly.
- [x] **GREEN** — Run `npm run test:run` → new config tests pass, all 34+ existing files still pass.

---

### 2. Add detectPiAuth utility

- [x] **RED** — In `tests/wizard/provider.test.ts` add: mock `fs` so `~/.pi/agent/auth.json` exists with one provider entry and `settings.json` has `defaultProvider`/`defaultModel`; assert `detectPiAuth()` returns `{ available: true, provider, model }`. Add a second case with no auth.json → `{ available: false }`. Run `npm run test:run` → fails (function doesn't exist).
- [x] **ACTION** — Create `src/wizard/detect-pi-auth.ts`: reads `~/.pi/agent/auth.json` and `~/.pi/agent/settings.json`, returns the detection result. Export `detectPiAuth`.
- [x] **GREEN** — Run `npm run test:run` → new tests pass, all others still pass.

---

### 3. Update wizard provider step for pi auth choice

- [x] **RED** — In `tests/wizard/provider.test.ts` add: mock `detectPiAuth` to return available; mock prompter `select` to return "pi"; assert `runProviderStep()` returns `{ authMode: "pi", provider: "", modelId: "", apiKey: "" }` and that no provider/model/key prompts were shown. Add second case: user selects "own" → existing provider flow runs. Run `npm run test:run` → fails.
- [x] **ACTION** — In `src/wizard/steps/provider.ts`: call `detectPiAuth()` at start; if available, show two-choice prompt first ("Use existing pi's provider, model and auth" / "Set up separate credentials for reeboot"); if "pi" chosen return early with `authMode: "pi"`; otherwise run existing flow with `authMode: "own"`. Update `ProviderStepResult` type to include `authMode`.
- [x] **GREEN** — Run `npm run test:run` → all pass.

---

### 4. Thread authMode through wizard → launch → config.json

- [x] **RED** — In `tests/wizard/wizard.test.ts` add: run full wizard with mocked prompter choosing "pi auth"; assert written `config.json` has `agent.model.authMode: "pi"` and empty provider/model/apiKey. Run `npm run test:run` → fails (authMode not written).
- [x] **ACTION** — In `src/wizard/index.ts`: pass `authMode` from `providerResult` into the launch draft. In `src/wizard/steps/launch.ts`: include `authMode` when building config. In `src/setup-wizard.ts` non-interactive path: accept `authMode` option, write to config.
- [x] **GREEN** — Run `npm run test:run` → all pass.

---

### 5. Scaffold ~/.reeboot/agent/AGENTS.md on first run

- [x] **RED** — In `tests/context.test.ts` (or new `tests/agent-dir.test.ts`): in a temp dir, call `initAgentDir(tempDir)` where `~/.reeboot/agent/` does not exist; assert `agent/AGENTS.md` is created and contains the reeboot persona text. Run `npm run test:run` → fails (function doesn't exist / wrong path).
- [x] **ACTION** — Create `src/utils/agent-dir.ts`: export `initAgentDir(reebotDir)` that creates `agent/` dir and scaffolds `AGENTS.md` from `templates/main-agents.md` if it doesn't exist. Call `initAgentDir` from `initContexts` in `src/context.ts`.
- [x] **GREEN** — Run `npm run test:run` → all pass.

---

### 6. Update createLoader to always use ~/.reeboot/agent/ as agentDir

- [x] **RED** — In `tests/extensions/loader.test.ts` add: call `createLoader()` with a config that has `authMode: "pi"`; assert `loader.agentDir` ends with `.reeboot/agent`. Add same assertion for `authMode: "own"`. Run `npm run test:run` → fails (loader currently uses `~/.reeboot` not `~/.reeboot/agent/`).
- [x] **ACTION** — In `src/extensions/loader.ts`: change `agentDir` to `join(homedir(), '.reeboot', 'agent')`. Ensure `additionalSkillPaths` and `additionalExtensionPaths` still point to bundled dirs (no change needed there — they use `PACKAGE_ROOT`).
- [x] **GREEN** — Run `npm run test:run` → all pass.

---

### 7. Wire authMode="own" into pi session creation

- [x] **RED** — In `tests/agent-runner/pi-runner.test.ts` add: mock `createAgentSession`; call `runner.prompt()` with a config of `authMode: "own"`, `provider: "minimax"`, `apiKey: "mm-key"`; assert `createAgentSession` was called with a `settingsManager` that returns `"minimax"` from `getDefaultProvider()`, and an `authStorage` that `hasAuth("minimax")`; assert no file reads from `~/.pi/agent/`. Run `npm run test:run` → fails.
- [x] **ACTION** — In `src/agent-runner/pi-runner.ts` `_getOrCreateSession()`: import `AuthStorage`, `ModelRegistry`, `SettingsManager` from pi; if `authMode === "own"`: build `SettingsManager.inMemory(...)`, create `AuthStorage` with runtime override for the resolved key (config.json key → env var fallback), build `ModelRegistry`; pass all three to `createAgentSession`. Key resolution: check `config.apiKey` first, then `getEnvApiKey(provider)` from pi's env-api-keys.
- [x] **GREEN** — Run `npm run test:run` → all pass.

---

### 8. Wire authMode="pi" into pi session creation

- [x] **RED** — In `tests/agent-runner/pi-runner.test.ts` add: mock `createAgentSession`; call `runner.prompt()` with `authMode: "pi"`; assert `createAgentSession` was called with a `settingsManager` that reads from `~/.pi/agent/settings.json` and an `authStorage` that reads from `~/.pi/agent/auth.json`; assert `resourceLoader.agentDir` still points to `~/.reeboot/agent/`. Run `npm run test:run` → fails.
- [x] **ACTION** — In `_getOrCreateSession()`: if `authMode === "pi"`: use `SettingsManager.create(cwd, piAgentDir)` and `AuthStorage.create(piAuthPath)` and `ModelRegistry(authStorage, piModelsPath)` where `piAgentDir = ~/.pi/agent/`. Pass to `createAgentSession` alongside the reeboot `resourceLoader`.
- [x] **GREEN** — Run `npm run test:run` → all pass.

---

### 9. Update entrypoint.sh for REEBOOT_* env var translation

- [x] **RED** — Assert: `container/entrypoint.sh` does not contain handling for `REEBOOT_PROVIDER`, `REEBOOT_API_KEY`, `REEBOOT_MODEL`, `REEBOOT_AGENTS_MD`, `REEBOOT_AUTH_MODE`. Assertion passes — none of these exist yet.
- [x] **ACTION** — Update `container/entrypoint.sh`: if no `config.json` exists in `~/.reeboot/`, translate env vars to `--no-interactive` flags (`REEBOOT_PROVIDER` → `--provider`, etc). If `REEBOOT_AGENTS_MD` is set, write it to `~/.reeboot/agent/AGENTS.md` before starting. If `config.json` already exists, skip env var translation and start directly.
- [x] **GREEN** — Assert: `container/entrypoint.sh` contains handling for all five env vars; `REEBOOT_AGENTS_MD` write happens before the `exec node` call; existing config check gates the env var block.

---

### 10. Update non-interactive wizard path for authMode

- [x] **RED** — In `tests/wizard/wizard.test.ts` add: call `runWizard({ interactive: false, provider: "anthropic", apiKey: "sk-test", model: "claude-sonnet-4-5" })`; assert written config has `authMode: "own"`. Call again with `authMode: "pi"`; assert written config has `authMode: "pi"` and empty provider/model/apiKey. Run `npm run test:run` → fails (authMode not supported in non-interactive path).
- [x] **ACTION** — In `src/setup-wizard.ts`: add `authMode?: "pi" | "own"` to `WizardOptions`; write `authMode` (default `"own"`) into the built config object under `agent.model.authMode`. Clear provider/model/apiKey when `authMode: "pi"`.
- [x] **GREEN** — Run `npm run test:run` → all pass.

---

### 11. Update smoke tests for new agentDir path

- [x] **RED** — In `tests/smoke.test.ts` add: assert that `dist/extensions/loader.js` when imported and `createLoader` called returns a loader whose agentDir ends with `.reeboot/agent` not just `.reeboot`. Run `npm run check` → fails (current agentDir is `~/.reeboot`).
- [x] **ACTION** — This task has no implementation action — the fix was done in Task 6. If the smoke test fails after Task 6 is done, investigate why. Otherwise this is a verification task confirming Task 6 landed correctly.
- [x] **GREEN** — Run `npm run check` → all 35 test files pass including new smoke assertion.

---

### 12. Update CHANGELOG and bump version to 1.3.4

- [x] **RED** — Check: `CHANGELOG.md` does not contain `[1.3.4]`. `package.json` version is `1.3.3`. Both assertions pass.
- [x] **ACTION** — Bump `reeboot/package.json` to `1.3.4`. Add `## [1.3.4]` entry to `CHANGELOG.md` covering: authMode, pi detection in wizard, runner isolation, AGENTS.md path fix, Docker env var support.
- [x] **GREEN** — `package.json` version is `1.3.4`. `CHANGELOG.md` contains `[1.3.4]` with all five items listed.
