# Design — setup-wizard-improvements

## Overview

This request fixes four bugs and adds four features to the setup wizard and channel
commands. All changes are additive or surgical — no architecture changes.

---

## B4 — InquirerPrompter rewrite

### Decision: use `@inquirer/prompts` individual functions

Inquirer v13 removed the `inquirer.prompt([{ type: 'list' }])` legacy API. The fix
is to replace each method in `InquirerPrompter` with the corresponding v13 function:

| Old | New |
|---|---|
| `inquirer.prompt([{ type: 'list' }])` | `import { select } from '@inquirer/prompts'` |
| `inquirer.prompt([{ type: 'checkbox' }])` | `import { checkbox } from '@inquirer/prompts'` |
| `inquirer.prompt([{ type: 'input' }])` | `import { input } from '@inquirer/prompts'` |
| `inquirer.prompt([{ type: 'password' }])` | `import { password } from '@inquirer/prompts'` |
| `inquirer.prompt([{ type: 'confirm' }])` | `import { confirm } from '@inquirer/prompts'` |

**Constraint:** The `Prompter` interface is unchanged. `FakePrompter` is unchanged.
All existing wizard tests continue to pass without modification.

The `runSetupCommand` in `index.ts` also uses the old inquirer API directly (not via
`InquirerPrompter`) for the "Config already exists. Overwrite?" prompt — this must
also be updated.

---

## F3 — Private-first provider ordering + local inference

### Provider list reordering

Local providers appear first, separated from cloud by a visual divider:

```
Ollama (local)
llama.cpp (local)
LM Studio (local)
Custom OpenAI-compatible endpoint (local)
──────────────────────────────────────────
Anthropic (cloud)
OpenAI (cloud)
...
```

inquirer v13 `select` supports `new Separator()` for visual dividers.

### New local providers

llama.cpp and LM Studio use the identical `models.json` + `baseUrl` mechanism as
Ollama. No new templates needed — the wizard generates the same JSON structure with
a different `id`, `name`, and default `baseUrl`.

| Provider | Default baseUrl |
|---|---|
| Ollama | `http://localhost:11434/v1` |
| llama.cpp | `http://localhost:8080/v1` |
| LM Studio | `http://localhost:1234/v1` |
| Custom | user-provided |

### Local model auto-detection

After the user confirms the base URL, the wizard pings `GET <baseUrl>/models`.
- **Reachable:** parse response, show models as a select list
- **Unreachable:** show warning + fall back to plain text model ID input

The fetch is injected via `_deps.fetchLocalModels` for testing.

### Cloud flow reordering: provider → API key → model

Current: provider → model → api key
New: provider → api key → model

This allows the wizard to fetch the live models list after the key is available.

### Cloud live model fetch

After the user enters their API key, the wizard calls `fetchCloudModels(provider, apiKey)`.
- **Success:** show live list as select
- **Failure/timeout (3s):** fall back to static curated list with a warning

OpenRouter exception: models list is public (`GET https://openrouter.ai/api/v1/models`,
no auth required) — fetched before API key step.

`fetchCloudModels` is injected via `_deps.fetchCloudModels` for testing.

Provider API endpoints:

| Provider | Endpoint |
|---|---|
| Anthropic | `https://api.anthropic.com/v1/models` |
| OpenAI | `https://api.openai.com/v1/models` |
| Google | `https://generativelanguage.googleapis.com/v1beta/models` |
| Groq | `https://api.groq.com/openai/v1/models` |
| Mistral | `https://api.mistral.ai/v1/models` |
| xAI | `https://api.x.ai/v1/models` |
| OpenRouter | `https://openrouter.ai/api/v1/models` (no auth) |

---

## F4 — Custom escape hatch

A sentinel choice `{ name: 'Enter custom value...', value: '__custom__' }` is appended
to every select list (provider, model, search backend). When selected, the wizard
immediately calls `prompter.input()` for the raw value.

`FakePrompter.select()` validates that the answer is in the choices array — `__custom__`
must be in the choices for tests that exercise the custom path.

---

## F1 — `reeboot init` command + cleaner command map

### New command: `reeboot init`

Registers a new `init` command in `index.ts`. Delegates to `runSetupWizard` directly.
Does not check for existing config — always runs the wizard (same as current `reeboot setup`
but without the overwrite confirmation, since init implies a fresh start).

### `reeboot start` errors if no config

`handleDefaultAction` currently runs the wizard if no config exists. This behaviour
moves to `reeboot init` only. `reeboot start` (and `reeboot` bare) errors if no config:

```
✗ No configuration found. Run `reeboot init` to get started.
```

### `reeboot` bare → alias for `reeboot start`

The default action (`program.action(...)`) calls `handleDefaultAction` which now
always starts the agent (errors if no config) — identical to `reeboot start`.

### Deployment choice (Step 1)

`reeboot init` asks "Native or Docker?" as Step 1. Docker shows "coming soon" and
loops back to native. This placeholder wires in the integration point for the
`docker-setup` request without blocking this one.

---

## F2 — Owner number setup

### New command: `reeboot channels setup owner-whatsapp`

Registered under the existing `channels` command group. Standalone — can be run any
time to (re)configure the owner identity.

### Flow

1. Load existing config (must have `whatsapp.enabled: true` or error out)
2. Start a WhatsApp adapter in receive-only mode
3. Present the two-option menu
4. **Option 1 (self-chat):** clear `owner_id` in config, save, exit
5. **Option 2 (different number):** wait indefinitely for first incoming message,
   capture `peerId`, save as `owner_id`, print confirmation, exit
   - Raw keypress listener on stdin for `q`/`Q` → cancel gracefully

### Wizard integration

`runChannelsStep` calls `runOwnerSetupSubflow` immediately after a successful WhatsApp
QR scan. The subflow is injectable via `_deps.runOwnerSetup` for tests.

### B1 fix is part of F2

The WhatsApp subflow in the wizard calls `linkWhatsAppDevice` and on `onSuccess` must
also persist `enabled: true`. This is added to `runWhatsAppSubflow` in `channels.ts`:
load config → set `channels.whatsapp.enabled = true` → save (load→merge→save pattern).

The standalone `reeboot channels login whatsapp` command in `index.ts` gets the same fix.

---

## B3 — Agent name template substitution

### Template change

`reeboot/templates/main-agents.md` gets `{{AGENT_NAME}}` in place of `"Reeboot"`.

### Scaffolding

`scaffoldSetup()` in `wizard/index.ts` reads the template, replaces `{{AGENT_NAME}}`
with the configured name before writing to `~/.reeboot/contexts/main/AGENTS.md`.

If `AGENTS.md` already exists (re-run), it is overwritten with the current name.
This also handles the `reeboot setup` name-change case.

---

## D1 — WhatsApp JID troubleshooting docs

New "Troubleshooting" section in `docs/channels/whatsapp.md` covering:
- `@s.whatsapp.net` vs `@lid` explanation
- How to find the correct JID manually via debug log
- `reeboot channels setup owner-whatsapp` as the recommended automated approach

---

## Risk: `FakePrompter` choice validation for `__custom__`

`FakePrompter.select()` throws if the answer is not in the choices array. Any test
that exercises the custom path must queue `'__custom__'` as the select answer AND
ensure `__custom__` is in the choices. Since we control the choices, this is fine —
but test authors must know to include it.
