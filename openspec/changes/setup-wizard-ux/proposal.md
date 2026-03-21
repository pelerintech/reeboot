## Why

Phase 1 shipped a working agent but left setup as a multi-step manual process — `reeboot setup` asks five generic questions, cannot link WhatsApp or Signal inline, has no Ollama model support, and running `reeboot` with no arguments just prints help. Non-technical users cannot reach a working agent without significant friction. Phase 2 replaces this with a guided first-run wizard that starts automatically, connects channels inline, and launches the agent when done.

## What Changes

- `reeboot` (no args) now auto-detects whether config exists: if missing → wizard, if present → start agent
- `reeboot setup` re-runs the wizard with overwrite confirmation
- Wizard is a 4-step flow: provider → agent name → channels (WhatsApp/Signal inline) → search → launch
- Provider list expanded to 8 (Anthropic, OpenAI, Google, Groq, Mistral, xAI, OpenRouter, Ollama); curated model lists per provider; "other" removed
- Ollama: prompts for base URL and model ID, writes `~/.reeboot/models.json` correctly
- WhatsApp: QR code printed inline, 2-minute timeout with graceful fallback command
- Signal: Docker detection (not installed / not running / running), phone number prompt, QR inline, graceful fallback
- Web search sub-step (Step 3b): pick provider (DDG default, 5 options), enter API key if needed, SearXNG Docker detection with DDG fallback
- Step 4 (Launch): summary screen, offer to start agent immediately
- Wizard is atomic: config only written at the end, never partial state
- All wizard paths follow TDD red/green: tests written first, then implementation
- **BREAKING**: `reeboot` default behaviour changes from printing help to running wizard or starting agent

## Capabilities

### New Capabilities
- `first-run-entrypoint`: `reeboot` (no args) auto-detects config state and routes to wizard or agent start
- `wizard-provider-setup`: Step 1 — provider selection, API key prompt, curated model list, Ollama models.json write
- `wizard-channel-linking`: Step 3 — inline WhatsApp QR flow, inline Signal Docker flow, graceful timeouts and fallbacks
- `wizard-web-search-setup`: Step 3b — web search provider selection, API key entry, SearXNG Docker start, DDG fallback
- `wizard-launch`: Step 4 — configuration summary, immediate agent start option

### Modified Capabilities
- `cli-entrypoint`: default command behaviour changes (no-args → wizard-or-start instead of help)

## Impact

- `src/index.ts`: default program action changed
- `src/setup-wizard.ts`: full rewrite (~500 lines)
- `src/channels/whatsapp.ts`: expose `linkDevice()` method for wizard context
- `src/channels/signal.ts`: expose `linkDevice()` method for wizard context
- `templates/models-ollama.json`: new template file
- `tests/setup-wizard.test.ts`: full rewrite (TDD first)
- `tests/index.test.ts`: updated for new default behaviour
- New npm deps: none (all existing deps reused; `qrcode-terminal` already present)
