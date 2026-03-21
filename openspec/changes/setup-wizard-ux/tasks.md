## 1. Test Infrastructure (RED — write all failing tests first)

- [x] 1.1 Define `Prompter` interface and `FakePrompter` test helper in `tests/helpers/fake-prompter.ts`
- [x] 1.2 Write failing tests for first-run-entrypoint: no-args → wizard when no config, no-args → start when config present, `REEBOOT_CONFIG_PATH` override, `reeboot setup` overwrite prompt (yes/no)
- [x] 1.3 Write failing tests for wizard-provider-setup: all 8 providers selectable, curated model list per provider, API key stored, empty key rejected, Ollama URL + model, Ollama models.json written, agent name default + custom
- [x] 1.4 Write failing tests for wizard-channel-linking: no channels (skip), WhatsApp success, WhatsApp timeout → fallback, Docker not installed (Signal), Docker not running → skip, Docker running → phone prompt → container start → QR URL shown → timeout fallback, temp auth dir cleanup
- [x] 1.5 Write failing tests for wizard-web-search-setup: DDG default no key, Brave/Tavily/Serper/Exa API key stored, empty key rejected, SearXNG Docker not installed → DDG fallback, SearXNG Docker running → container start, SearXNG fail → DDG fallback, None → fetch_url only
- [x] 1.6 Write failing tests for wizard-launch: summary shows correct values, user starts now → config written + agent starts, user declines → config written + exit message, Ctrl+C before step 4 → no config file, WebChat URL shown on start

## 2. Shared Utilities (GREEN these before wizard)

- [x] 2.1 Implement `src/utils/docker.ts` — `checkDockerStatus(): Promise<'not-installed' | 'not-running' | 'running'>` with tests passing
- [x] 2.2 Implement `src/utils/atomic-config.ts` — ensure `saveConfig()` temp-file + rename pattern works cross-platform (extract from existing code if already there)
- [x] 2.3 Add `templates/models-ollama.json` template file for Ollama models.json output

## 3. Entry Point (GREEN)

- [x] 3.1 Update `src/index.ts` default action: check config path existence → wizard or start; ensure 1.2 tests pass
- [x] 3.2 Update `tests/index.test.ts` for new default behaviour; verify all 1.2 tests pass

## 4. Provider Setup (GREEN)

- [x] 4.1 Implement `Prompter` interface (`select`, `input`, `checkbox`, `confirm`) and `InquirerPrompter` wrapper in `src/wizard/prompter.ts`
- [x] 4.2 Implement `src/wizard/steps/provider.ts` — provider list (8), curated model lists, API key prompt with validation, Ollama URL + model ID prompt with validation; ensure 1.3 tests pass
- [x] 4.3 Implement `src/wizard/steps/provider.ts` — Ollama models.json write path; ensure Ollama scenarios in 1.3 pass
- [x] 4.4 Implement agent name step in `src/wizard/steps/name.ts`; ensure name scenarios in 1.3 pass

## 5. Channel Linking (GREEN)

- [x] 5.1 Expose `WhatsAppAdapter.linkDevice(onQr, onSuccess, onTimeout)` method in `src/channels/whatsapp.ts`; write unit test for the method signature
- [x] 5.2 Expose `SignalAdapter.linkDevice(phoneNumber, onQr, onSuccess, onTimeout)` method in `src/channels/signal.ts`; write unit test
- [x] 5.3 Implement `src/wizard/steps/channels.ts` — checkbox UI, WhatsApp sub-flow (QR render, 2-min timeout, fallback), temp auth dir cleanup; ensure 1.4 WhatsApp tests pass
- [x] 5.4 Implement Signal sub-flow in channels step — Docker detection (reuse `checkDockerStatus()`), phone number prompt, container start, QR URL print, 3-min timeout, fallback; ensure 1.4 Signal tests pass

## 6. Web Search Setup (GREEN)

- [x] 6.1 Implement `src/wizard/steps/web-search.ts` — DDG default, API-key providers (Brave/Tavily/Serper/Exa), SearXNG Docker flow, None; ensure 1.5 tests pass
- [x] 6.2 SearXNG container start logic in web-search step — reuses `checkDockerStatus()`, starts `reeboot-searxng` container, handles start failure with DDG fallback; ensure SearXNG scenarios in 1.5 pass

## 7. Launch Step & Wizard Orchestration (GREEN)

- [x] 7.1 Implement `src/wizard/steps/launch.ts` — summary display, start-now / later prompt, agent start call; ensure 1.6 launch tests pass
- [x] 7.2 Implement `src/wizard/index.ts` — orchestrates all steps in order (provider → name → channels → web-search → launch), accepts `Prompter` param, collects `ConfigDraft`, calls `saveConfig()` only at step 7.1; ensure 1.6 config-write and Ctrl+C tests pass
- [x] 7.3 Update `src/setup-wizard.ts` to delegate to new `src/wizard/index.ts` (keep the existing export name for backward compat)

## 8. Final Integration & Cleanup

- [x] 8.1 Run full test suite — all tests from tasks 1.2–1.6 must be green
- [x] 8.2 Update `README.md` quick-start to reflect new `reeboot` (no args) behaviour
- [x] 8.3 Manual smoke test: fresh `~/.reeboot/` → run `reeboot` → complete wizard with DDG + no channels → agent starts → WebChat accessible
- [x] 8.4 Manual smoke test: run `reeboot` again (config exists) → agent starts without wizard
