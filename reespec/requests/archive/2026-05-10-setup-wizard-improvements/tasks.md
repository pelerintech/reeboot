# Tasks — setup-wizard-improvements

Read order: brief.md → design.md → specs/ → this file.

---

### 1. Rewrite InquirerPrompter for inquirer v13

- [x] **RED** — Write `tests/wizard/inquirer-prompter.test.ts`: import `InquirerPrompter`
      and assert it has methods `select`, `input`, `password`, `checkbox`, `confirm`
      that match the `Prompter` interface. Mock `@inquirer/prompts` with vi.mock and
      verify each method calls the correct v13 function. Run `vitest run` → test fails
      (currently calls old `inquirer.prompt()` API).
- [x] **ACTION** — Rewrite `src/wizard/prompter.ts` `InquirerPrompter` methods to use
      individual functions from `@inquirer/prompts` (`select`, `checkbox`, `input`,
      `password`, `confirm`). Update the `runSetupCommand` overwrite-confirmation
      prompt in `src/index.ts` to use `confirm` from `@inquirer/prompts` directly.
- [x] **GREEN** — Run `vitest run tests/wizard/inquirer-prompter.test.ts` → passes.
      Run `vitest run tests/wizard.test.ts tests/setup-wizard.test.ts` → all existing
      wizard tests still pass.

---

### 2. `reeboot start` errors when no config exists

- [x] **RED** — Write `tests/cli-init.test.ts`: call `handleDefaultAction` with a
      non-existent config path and a mock `startAgent` dep. Assert the mock is NOT
      called and the process would have exited with the "Run `reeboot init`" message.
      Run `vitest run` → fails (current code runs wizard instead of erroring).
- [x] **ACTION** — Update `handleDefaultAction` in `src/index.ts`: when no config
      exists, print the error message and `process.exit(1)` instead of running the
      wizard. `reeboot` bare (default action) calls `handleDefaultAction` — no change
      needed there, it now inherits the error behaviour.
- [x] **GREEN** — Run `vitest run tests/cli-init.test.ts` → passes.

---

### 3. `reeboot init` command

- [x] **RED** — Extend `tests/cli-init.test.ts`: assert that calling the `init`
      command handler invokes `runSetupWizard` (inject via deps). Run `vitest run` →
      fails (command not registered).
- [x] **ACTION** — Register `program.command('init')` in `src/index.ts`. The action
      calls `runSetupWizard` directly (no overwrite confirmation — init always runs
      fresh). Wire injectable `_deps.runWizard` for testability.
- [x] **GREEN** — Run `vitest run tests/cli-init.test.ts` → all assertions pass.

---

### 4. Deployment choice step (Step 1 of init — Docker placeholder)

- [x] **RED** — Write `tests/wizard/deployment-step.test.ts`: call `runSetupWizard`
      with a FakePrompter that answers "native" for the deployment choice. Assert
      the wizard proceeds to the provider step. Then test "docker" answer — assert
      a "coming soon" message is logged and the wizard falls through to native.
      Run `vitest run` → fails (no deployment step exists).
- [x] **ACTION** — Add Step 1 to `src/wizard/index.ts`: `prompter.select` with
      choices `native` and `docker`. If `docker` selected, `console.log` the coming-
      soon message and proceed as native. Update `fullWizardAnswers` helper in
      `tests/wizard.test.ts` to prepend the deployment answer.
- [x] **GREEN** — Run `vitest run tests/wizard/deployment-step.test.ts tests/wizard.test.ts`
      → all pass.

---

### 5. `reeboot init` ends with "Start now?" prompt

- [x] **RED** — Extend `tests/wizard.test.ts`: full wizard run with `startNow = true`
      — assert the injected `startAgent` dep is called. Run with `startNow = false`
      — assert it is not called and a "Run reeboot start" message is printed.
      Run `vitest run` → fails (no start-now prompt at end).
- [x] **ACTION** — Add the "Start the agent now?" confirm prompt to the end of
      `runSetupWizard` in `src/wizard/index.ts`. Wire injectable `_deps.startAgent`
      for testing. On Y → call startAgent; on N → print instructions.
- [x] **GREEN** — Run `vitest run tests/wizard.test.ts` → passes.

---

### 6. Rewrite InquirerPrompter for inquirer v13 (index.ts direct usage)

- [x] **RED** — Already covered in Task 1 for the overwrite-confirmation prompt.
      Verify `tests/setup-wizard.test.ts` still passes after the `runSetupCommand`
      change. Run `vitest run tests/setup-wizard.test.ts` → if it fails, this task
      is active.
- [x] **ACTION** — If `runSetupCommand`'s overwrite prompt in `src/index.ts` still
      uses the legacy `inquirer.prompt()`, update it to use `confirm` from
      `@inquirer/prompts`. If already done in Task 1, mark done.
- [x] **GREEN** — Run `vitest run tests/setup-wizard.test.ts` → passes.

---

### 7. Private-first provider list + new local providers

- [x] **RED** — Extend `tests/wizard/provider.test.ts`: assert that `PROVIDERS` list
      has Ollama before Anthropic. Assert `llama.cpp` and `LM Studio` and
      `Custom endpoint` are present as choices. Assert a Separator exists between
      local and cloud sections. Run `vitest run` → fails (Anthropic is first, new
      providers absent).
- [x] **ACTION** — Reorder `PROVIDERS` in `src/wizard/steps/provider.ts`: local group
      first (Ollama, llama.cpp, LM Studio, Custom), then `new Separator()`, then cloud
      providers. Add the three new local provider entries.
- [x] **GREEN** — Run `vitest run tests/wizard/provider.test.ts` → passes.

---

### 8. Local model auto-detection

- [x] **RED** — Extend `tests/wizard/provider.test.ts`: test llama.cpp selection with
      injected `_deps.fetchLocalModels` that resolves to `['llama3', 'mistral']` —
      assert `select` is called with those models. Test with `fetchLocalModels`
      rejecting — assert `input` is called instead (manual fallback).
      Run `vitest run` → fails (no auto-detect logic).
- [x] **ACTION** — In `runProviderStep` for local providers: after base URL input,
      call `_deps.fetchLocalModels(baseUrl)` (default impl: `GET <baseUrl>/models`,
      parse `data[].id`; for Ollama use `/api/tags`, parse `models[].name`). Show
      models as select if resolved, plain input if rejected. Add `__custom__` sentinel
      to the detected models list too.
- [x] **GREEN** — Run `vitest run tests/wizard/provider.test.ts` → passes.

---

### 9. Cloud provider flow reorder: provider → API key → model

- [x] **RED** — Extend `tests/wizard/provider.test.ts`: for Anthropic, assert prompt
      call order is select(provider) → password(api key) → select(model). Currently
      order is select(provider) → select(model) → password(api key). Run `vitest run`
      → fails.
- [x] **ACTION** — Reorder the cloud branch in `runProviderStep`: move API key prompt
      before model prompt. Update `fullWizardAnswers` helper in `tests/wizard.test.ts`
      to reflect new order.
- [x] **GREEN** — Run `vitest run tests/wizard/provider.test.ts tests/wizard.test.ts`
      → passes.

---

### 10. Cloud live model fetch with static fallback

- [x] **RED** — Extend `tests/wizard/provider.test.ts`: test Anthropic with injected
      `_deps.fetchCloudModels` resolving to `['claude-3-5', 'claude-opus']` — assert
      select choices include those models. Test with `fetchCloudModels` rejecting —
      assert static fallback list is used instead. Run `vitest run` → fails.
- [x] **ACTION** — After API key prompt in cloud branch, call
      `_deps.fetchCloudModels(provider, apiKey)` (default impl: HTTP GET to provider
      API endpoint, 3s timeout, parse model IDs). Show live list if resolved, static
      list if rejected. Add `__custom__` sentinel to both lists.
      Special-case OpenRouter: fetch models before API key prompt (no auth required).
- [x] **GREEN** — Run `vitest run tests/wizard/provider.test.ts` → passes.

---

### 11. "Enter custom value..." escape hatch

- [x] **RED** — Write `tests/wizard/custom-escape.test.ts`: run `runProviderStep` with
      FakePrompter answering `__custom__` for provider select then `'myco/mymodel'` for
      the input. Assert result has that custom value. Run same for model select.
      Run `vitest run` → fails (`__custom__` not in choices, FakePrompter throws).
- [x] **ACTION** — Add `{ name: 'Enter custom value...', value: '__custom__' }` as the
      last choice in every `prompter.select()` call in provider step and web-search
      step. After each select, if answer is `__custom__`, call `prompter.input()` for
      the raw value. Use the input value in place of the select answer.
- [x] **GREEN** — Run `vitest run tests/wizard/custom-escape.test.ts` → passes.

---

### 12. WhatsApp `enabled: true` written after QR scan

- [x] **RED** — Write `tests/wizard/whatsapp-enable.test.ts`: set up a temp config
      with `whatsapp.enabled: false` and a sentinel custom field. Run
      `runWhatsAppSubflow` with an injected `linkFn` that calls `onSuccess`. Assert
      config now has `whatsapp.enabled: true` AND the sentinel field is preserved.
      Run `vitest run` → fails (subflow does not write config).
- [x] **ACTION** — In `runWhatsAppSubflow` in `src/wizard/steps/channels.ts`, on
      `onSuccess`: `loadConfig()` → set `.channels.whatsapp.enabled = true` → `saveConfig()`.
      Apply the same fix to the standalone `channels login whatsapp` handler in
      `src/index.ts`.
- [x] **GREEN** — Run `vitest run tests/wizard/whatsapp-enable.test.ts` → passes.

---

### 13. `reeboot channels setup owner-whatsapp` command

- [x] **RED** — Write `tests/wizard/owner-setup.test.ts`: call `runOwnerSetupCommand`
      with injected deps (mock WhatsApp adapter that emits a message with
      `peerId: '123@lid'`). Test self-chat selection → assert config `owner_id`
      cleared. Test "different number" selection → assert `owner_id` saved as
      `'123@lid'`. Run `vitest run` → fails (command not implemented).
- [x] **ACTION** — Implement `runOwnerSetupCommand` in a new file
      `src/wizard/steps/owner-setup.ts`. Register `channels setup owner-whatsapp`
      under the `channels` command group in `src/index.ts`. Self-chat path: load
      config → set `owner_id: ''` → save. Different-number path: start minimal
      WhatsApp adapter in receive-only mode, await first `messages.upsert`, capture
      `peerId`, load config → set `owner_id` → save. Q keypress cancels.
- [x] **GREEN** — Run `vitest run tests/wizard/owner-setup.test.ts` → passes.

---

### 14. Owner setup subflow runs after WhatsApp QR scan in wizard

- [x] **RED** — Extend `tests/wizard/whatsapp-enable.test.ts`: run `runChannelsStep`
      selecting WhatsApp, with `onSuccess` firing and `_deps.runOwnerSetup` injected.
      Assert `runOwnerSetup` is called after `onSuccess`. Run `vitest run` → fails.
- [x] **ACTION** — In `runWhatsAppSubflow` in `src/wizard/steps/channels.ts`, after
      writing `enabled: true` on success, call `opts.runOwnerSetup()` if provided or
      `runOwnerSetupCommand()` from `owner-setup.ts` by default.
- [x] **GREEN** — Run `vitest run tests/wizard/whatsapp-enable.test.ts` → passes.

---

### 15. Agent name `{{AGENT_NAME}}` template substitution

- [x] **RED** — Write `tests/wizard/agent-name.test.ts`: call `scaffoldSetup` with a
      temp dir and agent name "Ree". Assert `contexts/main/AGENTS.md` contains "Ree"
      and does NOT contain "Reeboot" or "{{AGENT_NAME}}". Run `vitest run` → fails
      (template copies "Reeboot" literally).
- [x] **ACTION** — Replace both occurrences of "Reeboot" in `templates/main-agents.md`
      with `{{AGENT_NAME}}`. Update `scaffoldSetup` in `src/wizard/index.ts` to
      replace `{{AGENT_NAME}}` with the agent name before writing, and always
      overwrite (not skip if exists) so re-runs update the name.
- [x] **GREEN** — Run `vitest run tests/wizard/agent-name.test.ts` → passes.

---

### 16. `reeboot setup` propagates name change to AGENTS.md

- [x] **RED** — Extend `tests/wizard/agent-name.test.ts`: write an `AGENTS.md`
      with name "Ree", then run `runSetupWizard` with agent name "Nova". Assert
      `AGENTS.md` now contains "Nova". Run `vitest run` → fails (scaffoldSetup
      currently skips existing files).
- [x] **ACTION** — Already covered by Task 15 ACTION (always overwrite). Verify the
      test passes without additional changes.
- [x] **GREEN** — Run `vitest run tests/wizard/agent-name.test.ts` → all assertions pass.

---

### 18. Changelog + version bump to 2.1.0

- [x] **RED** — Assert `CHANGELOG.md` does not contain `## [2.1.0]` and
      `reeboot/package.json` has `"version": "2.0.1"`. Run:
      `grep -c "2.1.0" CHANGELOG.md` → 0, `grep version reeboot/package.json` → 2.0.1.
- [x] **ACTION** — Bump `reeboot/package.json` to `"version": "2.1.0"`. Add
      `## [2.1.0] - 2026-05-XX` entry to `CHANGELOG.md` with:
      - **Breaking:** `reeboot start` (and bare `reeboot`) no longer launch the setup
        wizard when no config exists — they now error and instruct the user to run
        `reeboot init`. Deployments that relied on `reeboot start` triggering first-run
        setup must switch to `reeboot init`.
      - **Added:** `reeboot init` first-run wizard with deployment choice step.
      - **Added:** `reeboot channels setup owner-whatsapp` for owner identity capture.
      - **Added:** Local providers (llama.cpp, LM Studio, Custom endpoint) in wizard.
      - **Added:** Live model fetch from provider APIs; static lists as fallback.
      - **Added:** Private-first provider ordering (local before cloud).
      - **Added:** "Enter custom value..." escape hatch on all wizard select menus.
      - **Fixed:** Wizard provider/model menus degraded to plain text on Linux SSH
        (inquirer v13 API mismatch).
      - **Fixed:** WhatsApp `enabled: false` after QR scan — now written to config
        on successful link.
      - **Fixed:** Agent always introduced itself as "Reeboot" regardless of
        configured name — `{{AGENT_NAME}}` template substitution now applied at
        scaffold time and on every `reeboot setup` run.
- [x] **GREEN** — Run `grep -c "2.1.0" CHANGELOG.md` → 1.
      Run `grep version reeboot/package.json` → `"version": "2.1.0"`.

---

### 17. WhatsApp JID troubleshooting docs

- [x] **RED** — Assert `docs/channels/whatsapp.md` does NOT contain a "Troubleshooting"
      section or the string "@lid". Run: `grep -c "Troubleshooting" docs/channels/whatsapp.md`
      → returns 0. Assertion fails (section absent).
- [x] **ACTION** — Add a "## Troubleshooting" section to `docs/channels/whatsapp.md`
      explaining `@s.whatsapp.net` vs `@lid`, how to find the correct JID via debug
      log, and referencing `reeboot channels setup owner-whatsapp` as the automated fix.
- [x] **GREEN** — Run `grep -c "Troubleshooting" docs/channels/whatsapp.md` → returns 1.
      Run `grep -c "@lid" docs/channels/whatsapp.md` → returns > 0.

---

### 19. Fix gaps from evaluation (2026-05-10)

#### 19a. f1-init-command: `reeboot start` with no config still launched wizard

- [x] **RED** — Added `runStartCommand` test to `tests/cli-init.test.ts`: asserts
      `runStartCommand` with non-existent config calls `process.exit(1)` and prints
      "reeboot init" message. Run `vitest run tests/cli-init.test.ts` → failed
      (`runStartCommand is not a function`).
- [x] **ACTION** — Extracted `runStartCommand` (exported) from the inline `start`
      command action in `src/index.ts`. Updated the `start` command action to call
      `runStartCommand()`. The function errors with `process.exit(1)` when no config
      exists (same as `handleDefaultAction`).
- [x] **GREEN** — `vitest run tests/cli-init.test.ts` → 3 tests pass.

#### 19b. b1-whatsapp-enabled: standalone `channels login whatsapp` → enabled fix untested

- [x] **RED** — Added test to `tests/wizard/whatsapp-enable.test.ts`: calls
      `runWhatsAppLoginCommand` with injected `connectAdapter` dep. Run → failed
      (`runWhatsAppLoginCommand is not a function`).
- [x] **ACTION** — Extracted `runWhatsAppLoginCommand` (exported) from the inline
      `channels login whatsapp` action in `src/index.ts`. Updated the action to call
      it. The function accepts `_deps.connectAdapter` for testability.
- [x] **GREEN** — `vitest run tests/wizard/whatsapp-enable.test.ts` → 4 tests pass.

#### 19c. f2-owner-setup: Q-to-cancel scenario untested

- [x] **RED** — Added Q-cancel test to `tests/wizard/owner-setup.test.ts`: passes
      a `startAdapter` that immediately calls `cancelRef.cancel()`. Run → timed out
      (cancelRef mechanism missing).
- [x] **ACTION** — Added `CancelRef` interface to `owner-setup.ts`. Wired
      `cancelRef` through `startAdapter` dep. Used a resolve-based cancel pattern
      to break out of the wait promise, then calls `process.exit(0)` after the
      promise settles. Q-keypress path now calls `cancelRef.cancel()` instead of
      `process.exit` directly.
- [x] **GREEN** — `vitest run tests/wizard/owner-setup.test.ts` → 4 tests pass.

#### 19d. f3-providers: OpenRouter pre-key fetch + production cloud fallback warning

- [x] **RED** — Added two tests to `tests/wizard/provider.test.ts`: (1) OpenRouter
      must fetch models before API key prompt; (2) cloud fallback warning shows with
      injected dep. Run → OpenRouter test failed (fetch happened after API key).
- [x] **ACTION** — Added OpenRouter special-case in `src/wizard/steps/provider.ts`:
      pre-fetch models (public endpoint, no auth) before API key prompt. Fixed
      fallback warning to always show (removed `&& deps.fetchCloudModels` guard).
- [x] **GREEN** — `vitest run tests/wizard/provider.test.ts` → 15 tests pass.

#### 19e. f4-custom-escape: web search backend `__custom__` scenarios untested

- [x] **RED** — No `__custom__` coverage in `tests/wizard/web-search-subflow.test.ts`.
      Added two tests: last choice is `__custom__`, selecting it triggers `input`.
- [x] **ACTION** — Tests written. Implementation already existed.
- [x] **GREEN** — `vitest run tests/wizard/web-search-subflow.test.ts` → 6 tests pass.

#### 19f. Fix pre-existing test regressions from earlier tasks

- [x] **RED** — `tests/agent-dir.test.ts`, `tests/daemon.test.ts`, and
      `tests/entrypoint.test.ts` failing due to working-tree changes from earlier
      tasks (B3 template change, daemon nodeBin change, F1 handleDefaultAction change).
- [x] **ACTION** — Updated `agent-dir.test.ts` to expect `{{AGENT_NAME}}` instead
      of `Reeboot`. Updated `daemon.test.ts` to use regex matching for ExecStart
      (now includes nodeBin). Updated `entrypoint.test.ts` to assert error+exit
      instead of wizard launch when no config.
- [x] **GREEN** — `vitest run` → 147/147 test files pass.

---

### 20. Fix residual evaluation gaps (2026-05-10 19:26)

#### 20a. f1-init-command: "Config written to" → "Config saved."

- [x] **RED** — `grep -c "Config saved" src/wizard/steps/launch.ts` → 0 (absent).
- [x] **ACTION** — Changed `console.log("\n  ✓ Config written to ${finalConfigPath}")` to
      `console.log("\n  ✓ Config saved.")` in `src/wizard/steps/launch.ts` line 116.
      Matches the exact wording specified in the brief.
- [x] **GREEN** — `grep -c "Config saved" src/wizard/steps/launch.ts` → 1.
      `vitest run tests/wizard.test.ts tests/setup-wizard.test.ts` → all pass.

#### 20b. f3-providers: visual separator rendered in terminal

- [x] **RED** — Added test to `tests/wizard/provider.test.ts` asserting the separator
      entry is present in choices passed to `prompter.select`. Run → failed (separator
      was filtered out before reaching the prompter).
- [x] **ACTION** — (1) Added `SeparatorEntry` type to `SelectOptions.choices` union in
      `src/wizard/prompter.ts`. (2) Updated `InquirerPrompter.select` to map
      `SeparatorEntry` items to `new Separator()` from `@inquirer/prompts`. (3) Updated
      `FakePrompter.select` validation to skip entries with `type: 'separator'`. (4)
      Removed the `PROVIDERS.filter(p => p.type !== 'separator')` line in `provider.ts`
      so the separator passes through. (5) Added `Separator` class stub to
      `inquirer-prompter.test.ts` mock.
- [x] **GREEN** — `vitest run` → 147/147 test files pass.
