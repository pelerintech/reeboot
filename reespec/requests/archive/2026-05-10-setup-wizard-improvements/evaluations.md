## Evaluation — 2026-05-10 19:15

### b1-whatsapp-enabled
verdict:  ⚠️ PARTIAL
reason:   Spec requires `enabled: true` after both "the wizard channels step" AND "`reeboot channels login whatsapp`". The wizard path (`runWhatsAppSubflow` in `channels.ts`) is implemented and tested in `whatsapp-enable.test.ts`. The standalone `channels login whatsapp` handler in `src/index.ts` also has the fix (lines 446–456). However, no test covers the standalone login path — the spec scenario "GIVEN `reeboot channels login whatsapp` completes successfully THEN `config.json` has `whatsapp.enabled: true`" has no corresponding test case in any test file.
focus:    `reeboot/tests/` — no test exercises the standalone `channels login whatsapp` → enabled fix

---

### b3-agent-name
verdict:  ✅ SATISFIED
reason:   Template `templates/main-agents.md` contains `{{AGENT_NAME}}` and no hardcoded "Reeboot". `scaffoldSetup` in `src/wizard/index.ts` performs substitution and always-overwrites `AGENTS.md`. Both scenarios tested in `tests/wizard/agent-name.test.ts` (initial scaffold with "Ree", re-run with "Nova").

---

### b4-inquirer-v13
verdict:  ✅ SATISFIED
reason:   `InquirerPrompter` in `src/wizard/prompter.ts` uses `@inquirer/prompts` individual functions for all five methods. The `runSetupCommand` overwrite prompt in `src/index.ts` (line 118) also uses `confirm` from `@inquirer/prompts`. All 96 existing wizard tests pass without modification to `FakePrompter`.

---

### f1-init-command
verdict:  ⚠️ PARTIAL
reason:   `reeboot init` is registered and delegates to `runSetupWizard`. The bare `reeboot` default action correctly errors via `handleDefaultAction`. The "Start now?" prompt is present with injectable `_deps.startAgent`. However, `reeboot start` with no config does NOT error — the `start` command's action (lines 174–178 of `src/index.ts`) still calls `runWizard` non-interactively when no config exists, bypassing `handleDefaultAction`. The spec scenario "GIVEN no config WHEN `reeboot start` is run THEN it exits with non-zero code" is unmet for the actual `start` command.
focus:    `reeboot/src/index.ts` lines 174–178 — `start` command still launches wizard instead of erroring

---

### f2-owner-setup
verdict:  ⚠️ PARTIAL
reason:   `runOwnerSetupCommand` in `src/wizard/steps/owner-setup.ts` implements self-chat (clear `owner_id`), different-number (capture `peerId`), and error-if-disabled paths, all tested. Owner setup fires after QR scan in wizard (tested). The Q-to-cancel scenario is not tested: spec says "WHEN the user presses Q THEN the command exits cleanly without modifying config" — no test case exercises keypress cancellation and verifies config is unmodified.
focus:    `reeboot/tests/wizard/owner-setup.test.ts` — Q-cancel scenario absent

---

### f3-providers
verdict:  ⚠️ PARTIAL
reason:   Local-first ordering, llama.cpp/LM Studio defaults, local auto-detection, and cloud flow reorder are all implemented and tested. Two gaps: (1) Spec requires "WHEN the user selects OpenRouter THEN the models list is fetched immediately (before API key)" — no special-case exists; OpenRouter uses the same API-key-first cloud branch. (2) The warning "a warning note is displayed" when cloud model fetch fails only fires when `deps.fetchCloudModels` is injected (line 268: `if (liveModels.length === 0 && deps.fetchCloudModels)`) — the production path using `defaultFetchCloudModels` never shows this warning on failure.
focus:    `src/wizard/steps/provider.ts` — OpenRouter no-key pre-fetch unimplemented; cloud fallback warning gated on injected dep, silent in production

---

### f4-custom-escape
verdict:  ⚠️ PARTIAL
reason:   `__custom__` is present in provider select, model select (both live and static), and web search backend select. Provider and model escape hatch are tested in `tests/wizard/custom-escape.test.ts`. The two web-search-backend scenarios from the spec are not tested: "GIVEN the web search backend select list WHEN rendered THEN 'Enter custom value...' is the last option" and "GIVEN the user selects 'Enter custom value...' on the search backend list THEN a text input appears" have no test coverage.
focus:    `reeboot/tests/wizard/web-search-subflow.test.ts` or `custom-escape.test.ts` — search backend `__custom__` scenarios absent

---

### d1-jid-docs
verdict:  ✅ SATISFIED
reason:   `docs/channels/whatsapp.md` contains a "## Troubleshooting" section (line 102) covering `@s.whatsapp.net` vs `@lid`, multi-device mode explanation, manual JID recovery via `--log-level debug` with `peerId`, and a reference to `reeboot channels setup owner-whatsapp` as the recommended fix. All four spec scenarios are present.

---

## Triage

✅ Safe to skip:   b3-agent-name, b4-inquirer-v13, d1-jid-docs

⚠️ Worth a look:
- **b1-whatsapp-enabled** — standalone `channels login whatsapp` → enabled fix has no test
- **f1-init-command** — `reeboot start` with no config still launches wizard (lines 174–178 of `src/index.ts`), does not error as specced
- **f2-owner-setup** — Q-to-cancel scenario (press Q → exit cleanly, config unmodified) has no test
- **f3-providers** — OpenRouter pre-key model fetch unimplemented; cloud fallback warning silently suppressed in production path
- **f4-custom-escape** — web search backend `__custom__` scenarios (presence in list, triggering input) have no test coverage

---

## Evaluation — 2026-05-10 19:26

### b1-whatsapp-enabled
verdict:  ✅ SATISFIED
reason:   All three spec scenarios are covered. Wizard path: `channels.ts` `onSuccess` handler loads, sets `enabled: true`, saves (load→merge→save, lines 115–123). Standalone login: `runWhatsAppLoginCommand` in `index.ts` (lines 415–462) does the same write. Timeout path: `onTimeout` sets `success = false` and no config write occurs (`channels.ts` line 134–135). All three scenarios are tested in `tests/wizard/whatsapp-enable.test.ts`.

---

### b3-agent-name
verdict:  ✅ SATISFIED
reason:   `templates/main-agents.md` contains `{{AGENT_NAME}}` in two places (lines 1 and 3) and no hardcoded "Reeboot". `scaffoldSetup` in `wizard/index.ts` (lines 165–168) replaces the placeholder with the configured name and always overwrites, handling both initial scaffold and `reeboot setup` name changes. Tests in `tests/wizard/agent-name.test.ts` cover all three spec scenarios.

---

### b4-inquirer-v13
verdict:  ✅ SATISFIED
reason:   `InquirerPrompter` in `src/wizard/prompter.ts` uses individual functions from `@inquirer/prompts` for all five methods (`select`, `input`, `password`, `checkbox`, `confirm`). `runSetupCommand` in `index.ts` (line 166) also uses `confirm` from `@inquirer/prompts` for the overwrite prompt. All 147 test files pass, confirming `FakePrompter` and existing wizard tests are unmodified.

---

### f1-init-command
verdict:  ⚠️ PARTIAL
reason:   `reeboot init`, `reeboot start` error, and `reeboot` bare-alias are all implemented and tested. Docker "coming soon" message is present (`wizard/index.ts` line 55). The "Start now?" confirm prompt works. However, the brief specifies the exact confirmation message as "✓ Config saved. Start the agent now? (Y/n)" — the actual message printed is "✓ Config written to <path>" (`launch.ts` line 116), not "Config saved." The N-path message "Run 'reeboot start' when you're ready." is present (`wizard/index.ts` line 122).
focus:    `reeboot/src/wizard/steps/launch.ts` line 116 — prints "Config written to" instead of "Config saved."

---

### f2-owner-setup
verdict:  ✅ SATISFIED
reason:   `reeboot channels setup owner-whatsapp` is registered in `index.ts` (lines 742–750). `runOwnerSetupCommand` in `owner-setup.ts` implements all spec scenarios: self-chat clears `owner_id`, different-number captures `peerId` exactly and prints confirmation, Q-to-cancel exits without modifying config (via `CancelRef` pattern, tested), WhatsApp-not-enabled errors with the specified message. Owner setup fires after wizard QR scan success (`channels.ts` line 128). All scenarios tested in `tests/wizard/owner-setup.test.ts` and `tests/wizard/whatsapp-enable.test.ts`.

---

### f3-providers
verdict:  ⚠️ PARTIAL
reason:   Three gaps remain against the spec. (1) Visual separator: spec says "a visual separator divides local from cloud providers" — `PROVIDER_SEPARATOR` exists in the `PROVIDERS` array but is explicitly filtered out before being passed to `prompter.select` (`provider.ts` line 146), so no separator appears in the actual terminal UI. (2) OpenRouter API key order: spec says "the API key is asked after the model is selected" — implementation does pre-fetch → API key → model (`provider.ts` lines 222–310), but spec requires pre-fetch → model select → API key. (3) "server not reachable" warning wording is "Server not reachable or no models found" vs spec's "server not reachable" — minor divergence.
focus:    `reeboot/src/wizard/steps/provider.ts` — line 146 (separator filtered out); lines 230–265 (OpenRouter API key before model, not after)

---

### f4-custom-escape
verdict:  ✅ SATISFIED
reason:   `__custom__` sentinel with "Enter custom value..." label is the last choice in provider select (`provider.ts` lines 148–149), all model selects for local detected models (line 193), all model selects for live/static cloud lists (lines 265, 285), and the web search backend select (`web-search.ts` lines 39–45). Selecting it in each case triggers a `prompter.input()` call. Tested in `tests/wizard/custom-escape.test.ts` and `tests/wizard/web-search-subflow.test.ts`.

---

### d1-jid-docs
verdict:  ✅ SATISFIED
reason:   `docs/channels/whatsapp.md` contains a "## Troubleshooting" section (line 102). It explains `@s.whatsapp.net` vs `@lid` (lines 110–111), explains why Baileys uses `@lid` in multi-device mode (line 113), explains how to find the correct JID via `--log-level debug` and the `peerId` field (lines 115–120), and references `reeboot channels setup owner-whatsapp` as the recommended fix (lines 135–138).

---

## Triage

✅ Safe to skip:   b1-whatsapp-enabled, b3-agent-name, b4-inquirer-v13, f2-owner-setup, f4-custom-escape, d1-jid-docs

⚠️  Worth a look:
- **f1-init-command** — brief specifies "✓ Config saved." as the message before the "Start now?" prompt; actual output is "✓ Config written to <path>". Wording mismatch. `launch.ts` line 116.
- **f3-providers** — (a) visual separator between local and cloud providers is defined in `PROVIDERS` but filtered out before being passed to `prompter.select`, so it never renders on the terminal; (b) OpenRouter flow is pre-fetch → API key → model, but spec requires pre-fetch → model select → API key (key asked *after* model is selected). `provider.ts` lines 146 and 230–265.

---

## Evaluation — 2026-05-10 19:38

### b1-whatsapp-enabled
verdict: ✅ SATISFIED
reason: Spec requires `config.json` to gain `channels.whatsapp.enabled = true` on success (load→merge→save), and NOT on timeout. Both paths are covered: the wizard's `onSuccess` callback writes the flag in `wizard/steps/channels.ts:122`, the standalone `runWhatsAppLoginCommand` writes it after `connectAdapter()` resolves in `src/index.ts:453–458`, and the `onTimeout` path resolves without writing. All four scenarios have passing tests in `tests/wizard/whatsapp-enable.test.ts`.

---

### b3-agent-name
verdict: ✅ SATISFIED
reason: Spec requires `{{AGENT_NAME}}` placeholder in `main-agents.md`, no hardcoded "Reeboot", and name propagation on re-run. `reeboot/templates/main-agents.md` contains only `{{AGENT_NAME}}` with no "Reeboot" literal. `wizard/index.ts:166–168` replaces the placeholder with the configured name and uses "always overwrite" to handle name changes on re-run. `reeboot setup` calls the same `runSetupWizard` → `scaffoldSetup` path.

---

### b4-inquirer-v13
verdict: ✅ SATISFIED
reason: Spec requires `InquirerPrompter` to use `@inquirer/prompts` individual functions and keep `FakePrompter`-based tests passing. `wizard/prompter.ts` implements all five methods (`select`, `input`, `password`, `checkbox`, `confirm`) using `@inquirer/prompts` dynamic imports with no legacy `inquirer.prompt()` call. All 104 wizard tests pass without modification (`tests/wizard/inquirer-prompter.test.ts` included).

---

### d1-jid-docs
verdict: ✅ SATISFIED
reason: Spec requires a Troubleshooting section in `docs/channels/whatsapp.md` explaining `@s.whatsapp.net` vs `@lid`, why Baileys uses `@lid` in multi-device mode, how to find the correct JID via `peerId` in debug logs, and a reference to `reeboot channels setup owner-whatsapp`. All four sub-requirements are present in the file at lines 102–138.

---

### f1-init-command
verdict: ✅ SATISFIED
reason: Spec requires: (1) `reeboot start` exits with error when no config; (2) bare `reeboot` behaves identically; (3) `reeboot init` launches wizard; (4) Y to "Start the agent now?" starts agent; (5) N prints "Run 'reeboot start' when you're ready."; (6) Docker selection shows "coming soon" and continues. All six scenarios are satisfied — `runStartCommand` and `handleDefaultAction` both exit with "✗ No configuration found. Run `reeboot init` to get started.", wizard shows "Start the agent now?" with both branches, and "Docker support coming soon. Continuing with native setup." is in `wizard/index.ts:55`.

---

### f2-owner-setup
verdict: ✅ SATISFIED
reason: Spec requires a `reeboot channels setup owner-whatsapp` command covering five flows (shown choice, self-chat clears `owner_id`, different-number captures exact `peerId`, Q cancels without modifying config, WhatsApp-not-enabled shows error) plus owner setup running immediately after QR scan. All are present: the command is wired in `src/index.ts:743–748`, all flows are implemented in `wizard/steps/owner-setup.ts`, the QR `onSuccess` callback fires `opts.runOwnerSetup()` in `wizard/steps/channels.ts:128`, and all 14 tests in `tests/wizard/owner-setup.test.ts` pass.

---

### f3-providers
verdict: ⚠️ PARTIAL
reason: Most requirements are satisfied — Ollama before Anthropic, visual separator present, llama.cpp pre-fills `http://localhost:8080/v1`, LM Studio `http://localhost:1234/v1`, local server reachable shows model select, server unreachable shows warning and manual input, cloud order is provider → API key → model, live model fetch with static fallback, OpenRouter pre-fetches without API key and user still enters key. One gap: the spec states "warning note is displayed" when the static curated fallback is used after a live fetch fails for cloud providers — the code only prints `'⚠  Could not fetch live models. Using curated list.\n'` when `liveModels.length === 0` after both OpenRouter pre-fetch and live fetch fail, but the `openRouterPreFetchedModels` path could bypass the warning when the pre-fetch succeeded and was used directly. This is a minor edge case, not the primary warning path.
focus: `wizard/steps/provider.ts:279–280` — verify warning is shown when OpenRouter pre-fetched models are used directly (bypasses the `liveModels.length === 0` warning branch at line 279)

---

### f4-custom-escape
verdict: ✅ SATISFIED
reason: Spec requires "Enter custom value..." as the last option on all three select lists (provider, model, search backend) and a free-text prompt on selection. Confirmed in `wizard/steps/provider.ts` for provider (`providerChoicesWithCustom`) and model (`modelChoices`/`staticWithCustom` in both local and cloud paths), and in `wizard/steps/web-search.ts:39` for search backend. All trigger a follow-up `input` prompt.

---

## Triage

✅ Safe to skip: b1-whatsapp-enabled, b3-agent-name, b4-inquirer-v13, d1-jid-docs, f1-init-command, f2-owner-setup, f4-custom-escape

⚠️ Worth a look:
- **f3-providers** — spec says "warning note is displayed" when the static fallback is used after live fetch fails; for OpenRouter, the pre-fetched models are passed directly into `liveModels` and shown without going through the `liveModels.length === 0` warning branch — no warning appears in that branch even if the pre-fetch was the only thing that worked. Small edge case but technically a gap against spec wording.

---
