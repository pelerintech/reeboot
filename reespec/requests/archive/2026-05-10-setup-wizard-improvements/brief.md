# Brief — setup-wizard-improvements

## Problem

The current setup experience has several gaps that cause silent failures for new users,
discovered through a real Linux installation session on 2026-05-10.

## Confirmed Bugs

### B1 — WhatsApp `enabled: false` after QR scan
`reeboot channels login whatsapp` saves Baileys credentials but never writes
`whatsapp.enabled = true` to `config.json`. On next `reeboot start`, WhatsApp is
silently disabled. Every user who follows the docs hits this.

**Fix:** after successful connection in the login command, load config → set
`channels.whatsapp.enabled = true` → save. Must use the load→merge→save pattern
(same as the 2.0.0 wizard fix) to avoid resetting other fields.

### B2 — WhatsApp `owner_id` JID format is unpredictable (`@s.whatsapp.net` vs `@lid`)
Even if a user correctly sets `owner_id`, Baileys may deliver messages using the
`@lid` format (a random opaque ID unrelated to the phone number) in multi-device mode.
The policy layer does strict `===` equality — wrong format = silent drop.

**Fix:** owner detection flow (see F2) captures the real peerId directly from a live
message, eliminating the format ambiguity entirely. No format guessing needed.

### B3 — Agent name ignored — always introduces itself as "Reeboot"
`main-agents.md` template has `"Reeboot"` hardcoded in two places. During scaffolding
it is copied as-is to `~/.reeboot/contexts/main/AGENTS.md` — the name from config is
never substituted. Additionally, if the user changes their agent name via `reeboot setup`,
the already-written `AGENTS.md` is not updated.

**Fix:** add `{{AGENT_NAME}}` placeholder to `main-agents.md` template. Replace it
during scaffolding with the configured name. On `reeboot setup` name change, rewrite
`AGENTS.md` with the new name.

### B4 — Wizard provider/model select menus degrade to plain text on Linux SSH
`InquirerPrompter` uses the old `inquirer.prompt([{ type: 'list' }])` API.
The package is pinned to `^13.4.0` which rewrote the API entirely — the old pattern
silently falls back to plain text input. Users end up typing provider and model names
manually with no guidance on valid values.

**Fix:** rewrite `InquirerPrompter` to use the new inquirer v13 API
(`@inquirer/prompts` individual functions: `select`, `checkbox`, `input`, `password`,
`confirm`).

## New Features

### F1 — `reeboot init` command + cleaner command map
Separate first-time setup from starting the agent.

```
reeboot              → alias for reeboot start
reeboot init         → first time setup wizard, writes config
reeboot start        → start the agent (clear error if not initialised)
reeboot setup        → re-run/edit config on existing install
```

`reeboot start` with no config should fail clearly:
```
✗ No configuration found. Run `reeboot init` to get started.
```

`reeboot init` ends with:
```
✓ Config saved. Start the agent now? (Y/n)
```
Yes → starts immediately. No → prints "Run 'reeboot start' when you're ready."

### F2 — Owner number setup command
New standalone commands `reeboot channels setup owner-whatsapp` (and `owner-signal`)
that capture and save the owner's contact identity. Also called as a step in
`reeboot init` immediately after WhatsApp QR scan succeeds.

**Flow:**
```
How will you message this agent?

  1. From this same WhatsApp number (self-chat)
  2. From a different number — I'll send a test message now

Choice [1]:
```

- **Option 1 (self-chat / Mode 1):** clears `owner_id`, leaves `owner_only: true`.
  Works for single-number setups and local development.
- **Option 2 (dedicated number / Mode 2):** waits indefinitely for an incoming
  message, captures `peerId` exactly as Baileys reports it (no format guessing),
  saves it as `owner_id`. Shows "Waiting for a message from your phone...
  press Q to cancel" UI. No arbitrary timeout.

### F3 — Private-first provider ordering + local inference options
The provider list is reordered to surface local options first, reflecting
reeboot's privacy-first philosophy. llama.cpp and LM Studio work today via
the same `models.json` + `baseUrl` mechanism as Ollama — they just need to
be surfaced in the wizard.

```
Local (private):
  Ollama          — http://localhost:11434/v1
  llama.cpp       — http://localhost:8080/v1
  LM Studio       — http://localhost:1234/v1
  Custom endpoint — any OpenAI-compatible server (ask for baseUrl + model)
  ────────────────────────────────────────────
Cloud:
  Anthropic, OpenAI, Google, Groq, Mistral, xAI, OpenRouter
  Use pi's auth (shown only if pi is detected)
```

**Local provider flow:**
1. Show pre-filled base URL (user can override)
2. Ping the server — if reachable, fetch and show detected models as a select list
3. If server not running: show clear message + manual model ID entry as fallback

**Cloud provider flow (reordered):**
1. Select provider
2. Enter API key (needed first to unlock model fetch)
3. Fetch live models list from provider API → show as select list
4. Fall back to curated static list if fetch fails or times out

Reordering to provider → API key → model (instead of current provider → model → API key)
makes live model fetching possible and is a more logical setup sequence.
Static curated lists become fallbacks only, not the primary source.

OpenRouter exception: models list is public — can be fetched before API key is entered.

### F4 — "Enter custom..." escape hatch on all select menus
Every curated list (provider, model, search backend) gets a final option:
```
  Enter custom value...
```
Selecting it prompts the user to type the value manually. Advanced users can
use any model ID without being blocked by the curated list.

## Wizard Flow (validated)

Deployment method is a root branch — it determines the entire wizard path.

```
reeboot init
│
├── Welcome screen
│
├── Step 1: Deployment method
│     ▶ Native (daemon)
│       Docker (full stack)
│
├─────────────────────────────────────────────────────────
│  NATIVE PATH                │  DOCKER PATH
├─────────────────────────────────────────────────────────
│  Step 2: AI Provider        │  Step 2: Check Docker
│    select + pi auth         │    installed, error if not
│  Step 3: API Key            │  Step 3: AI Provider
│    skipped if local/pi/env  │  Step 4: API Key
│  Step 4: Model              │  Step 5: Model
│    live fetch or fallback   │  Step 6: Agent name
│    local: auto-detect       │
│  Step 5: Agent name         │  Step 7: Channels
│  Step 6: Channels           │    WhatsApp → QR + owner
│    WhatsApp → QR + owner    │    Signal → included in
│    Signal → manual setup    │    compose automatically
│  Step 7: Web search         │  Step 8: Include SearXNG?
│    select + custom...       │    Y/N — no provider choice,
│  Step 8: Summary + confirm  │    self-hosted automatically
│  Step 9: Start now?         │  Step 9: Summary + confirm
│    Y → start daemon         │  Step 10: Build + up
│    N → print instructions   │    docker compose build
│                             │    docker compose up -d
└─────────────────────────────────────────────────────────
```

Note: Docker path is deferred to the `docker-setup` request. `reeboot init`
should show the deployment choice in Step 1 but display "coming soon" for
Docker until that request ships.

## Key Constraints

- All config writes must use load→merge→save pattern — never overwrite the full
  config from defaults. The 2.0.0 fix established this pattern via `fb()` helper.
- `AGENTS.md` is the agent's identity file — name changes must propagate there.
- The `InquirerPrompter` rewrite must keep the `Prompter` interface unchanged so
  all existing tests that inject `FakePrompter` continue to work without modification.
- Local provider templates (llama.cpp, LM Studio, custom) follow the same
  `models.json` pattern as Ollama — no new infrastructure needed.

## Documentation Updates

### D1 — WhatsApp `owner_id` JID format explained
Add a troubleshooting section to `docs/channels/whatsapp.md` explaining:
- What `@s.whatsapp.net` vs `@lid` means and why Baileys uses either
- That manually setting `owner_id` to a phone number format may not work
  in multi-device mode
- How to find the correct JID: run `reeboot start --log-level debug`, send
  a message, look for `peerId` in the log, copy that exact value
- That `reeboot channels setup owner-whatsapp` (F2) handles this automatically
  and is the recommended approach

## Already Fixed (2.0.1)

- `reeboot channel *` docs used singular — CLI uses `channels` (plural). Fixed in docs.
- Daemon fails on nvm (exit code 127). Fixed in daemon generator.

## Out of Scope

- Signal channel bugs (separate request)
- Multi-owner / trusted_senders setup  
- Windows support
