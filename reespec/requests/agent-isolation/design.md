# Design: agent-isolation

## Core architectural decision: split auth from identity

Pi's `DefaultResourceLoader` uses `agentDir` for two distinct purposes:
1. **Identity**: AGENTS.md, SYSTEM.md, extensions, skills, themes
2. **Auth/model**: auth.json, models.json, settings.json

Reeboot needs to split these: identity always comes from `~/.reeboot/agent/`, auth/model comes from either pi's dir or reeboot's own config depending on `authMode`.

## Directory structure (target)

```
~/.reeboot/
  agent/                        ← pi agentDir for reeboot (NEW)
    AGENTS.md                   ← reeboot persona (moved from contexts/main/)
    extensions/                 ← (empty — bundled extensions injected via factories)
    skills/                     ← (empty — bundled skills injected via additionalSkillPaths)
  config.json                   ← reeboot config (provider, model, authMode, search, etc)
  contexts/
    global/
      AGENTS.md                 ← global memory (user-editable, appended to persona)
    main/
      workspace/                ← agent working directory
      AGENTS.md                 ← context-specific additions (user-editable)
  channels/
    whatsapp/auth/              ← baileys session files
  sessions/                     ← conversation history
```

## config.json: authMode field

```json
{
  "agent": {
    "model": {
      "authMode": "pi",    ← "pi" | "own"
      "provider": "",      ← used only when authMode="own"
      "id": "",            ← used only when authMode="own"
      "apiKey": ""         ← used only when authMode="own"
    }
  }
}
```

`authMode` defaults to `"own"` — safe default, no accidental pi dependency.

## Wizard: pi detection logic

```
detectPiAuth():
  1. Check ~/.pi/agent/auth.json exists
  2. Parse it — has at least one provider entry
  3. Check ~/.pi/agent/settings.json exists — has defaultProvider + defaultModel
  → returns: { available: true, provider, model } | { available: false }

If available:
  Prompt: "Pi is installed and authenticated."
  Choices:
    "Use existing pi's provider, model and auth"  → authMode="pi"
    "Set up separate credentials for reeboot"     → authMode="own" → existing flow

If not available:
  → existing flow directly (authMode="own")
```

## Runner: createAgentSession wiring (target)

```
authMode = "pi":
  settingsManager = SettingsManager.create(cwd, "~/.pi/agent/")
  authStorage     = AuthStorage.create("~/.pi/agent/auth.json")
  modelRegistry   = new ModelRegistry(authStorage, "~/.pi/agent/models.json")
  agentDir        = "~/.reeboot/agent/"   ← always reeboot's

authMode = "own":
  settingsManager = SettingsManager.inMemory({ defaultProvider, defaultModel })
  authStorage     = AuthStorage with runtimeOverride(provider, resolvedKey)
  modelRegistry   = new ModelRegistry(authStorage, "~/.reeboot/agent/models.json")
  agentDir        = "~/.reeboot/agent/"   ← always reeboot's

Key resolution for authMode="own":
  1. config.json apiKey          (user entered in wizard)
  2. provider-specific env var   (MINIMAX_API_KEY, OPENAI_API_KEY, etc — from pi's envMap)
  3. (no further fallback — explicit is better than accidental)
```

## AuthStorage: how to create with runtime override

Pi's `AuthStorage` does not expose a simple constructor for runtime overrides via its public API. The approach is:

1. Create `AuthStorage` from reeboot's own path (`~/.reeboot/agent/auth.json` — may not exist)
2. Call `authStorage.setRuntimeOverride(provider, apiKey)` before passing to ModelRegistry

This avoids reading pi's auth.json in `authMode="own"` and avoids reading reeboot's (non-existent) auth.json in `authMode="pi"`.

## AGENTS.md: scaffold and migration

On startup (via `initContexts` or equivalent):
- Ensure `~/.reeboot/agent/` exists
- If `~/.reeboot/agent/AGENTS.md` does not exist, scaffold from `templates/main-agents.md`
- Existing `~/.reeboot/contexts/main/AGENTS.md` is left in place (user may have edited it) — pi will pick it up via cwd walk from workspace/

Wait — pi walks up from `cwd` (workspace/) through ancestors. The path is:
```
workspace/ → main/ → contexts/ → .reeboot/ → ~/ → /
```
Pi looks for AGENTS.md *inside* each directory, so it WILL find:
- `~/.reeboot/contexts/main/AGENTS.md`  (if cwd is workspace/ and walks up to main/)

Actually no — pi looks for AGENTS.md *in* the directory itself, not named after it. So walking from `workspace/`:
- `~/.reeboot/contexts/main/workspace/AGENTS.md`  ← not there
- `~/.reeboot/contexts/main/AGENTS.md`             ← FOUND ✓ (project-level)
- `~/.reeboot/contexts/AGENTS.md`                  ← not there
- `~/.reeboot/AGENTS.md`                           ← not there
- `~/.reeboot/agent/AGENTS.md`                     ← NOT in walk path

So `~/.reeboot/agent/AGENTS.md` is only read via `agentDir`, not the cwd walk. This is correct — it's the global reeboot persona. The `contexts/main/AGENTS.md` is read via the cwd walk as a project-level addition. Both are appended by pi.

This means the existing `contexts/main/AGENTS.md` continues to work as context-specific additions on top of the global persona. No migration needed.

## Docker / headless: entrypoint env var mapping

```
REEBOOT_PROVIDER    → --provider
REEBOOT_API_KEY     → --api-key
REEBOOT_MODEL       → --model
REEBOOT_NAME        → --name
REEBOOT_AGENTS_MD   → written to ~/.reeboot/agent/AGENTS.md before start
REEBOOT_AUTH_MODE   → --auth-mode (new flag: "pi" | "own", default "own")
```

Entrypoint logic:
```sh
if [ -n "$REEBOOT_AGENTS_MD" ]; then
  mkdir -p ~/.reeboot/agent
  echo "$REEBOOT_AGENTS_MD" > ~/.reeboot/agent/AGENTS.md
fi
# build flags from env vars, call node dist/index.js start --no-interactive $FLAGS
```

Non-interactive path in `setup-wizard.ts` gains `authMode` support.

## Risks

- `AuthStorage` runtime override API: need to verify it's exposed in pi's public types
- `SettingsManager.create(cwd, piAgentDir)` for authMode="pi": need to verify it doesn't write back to pi's settings
- Existing installations: users with `authMode` absent in config.json → default to "own", wizard re-prompts on next `reeboot setup`
