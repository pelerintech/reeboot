# Spec: runner isolation

## RI-1: agentDir is always ~/.reeboot/agent/ regardless of authMode

GIVEN authMode is "pi"
WHEN createLoader() is called
THEN resourceLoader.agentDir === ~/.reeboot/agent/

GIVEN authMode is "own"
WHEN createLoader() is called
THEN resourceLoader.agentDir === ~/.reeboot/agent/

## RI-2: authMode="own" uses inMemory settingsManager with correct provider+model

GIVEN config with authMode="own", provider="anthropic", id="claude-sonnet-4-5"
WHEN _getOrCreateSession() builds the settingsManager
THEN settingsManager.getDefaultProvider() === "anthropic"
AND settingsManager.getDefaultModel() === "claude-sonnet-4-5"
AND no file reads from ~/.pi/agent/settings.json occur

## RI-3: authMode="own" injects API key as runtime override

GIVEN config with authMode="own", provider="minimax", apiKey="mm-key-xyz"
WHEN _getOrCreateSession() builds the authStorage
THEN authStorage.hasAuth("minimax") === true
AND the key was set via runtimeOverride, not read from any file

## RI-4: authMode="own" key resolution falls back to env var

GIVEN config with authMode="own", provider="openai", apiKey=""
AND process.env.OPENAI_API_KEY="sk-env-key"
WHEN _getOrCreateSession() resolves the key
THEN authStorage.hasAuth("openai") === true using the env var value

## RI-5: authMode="pi" uses ~/.pi/agent/ for settings and auth

GIVEN config with authMode="pi"
AND ~/.pi/agent/settings.json exists with defaultProvider="anthropic"
AND ~/.pi/agent/auth.json exists with anthropic credentials
WHEN _getOrCreateSession() builds settingsManager and authStorage
THEN settingsManager reads from ~/.pi/agent/settings.json
AND authStorage reads from ~/.pi/agent/auth.json

## RI-6: ~/.reeboot/agent/AGENTS.md is scaffolded on first run

GIVEN ~/.reeboot/agent/AGENTS.md does not exist
WHEN the agent starts (initContexts or equivalent)
THEN ~/.reeboot/agent/AGENTS.md is created from templates/main-agents.md
AND its content matches the reeboot persona template
