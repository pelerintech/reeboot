# Spec: docker headless

## DH-1: REEBOOT_PROVIDER env var flows into non-interactive config

GIVEN REEBOOT_PROVIDER=minimax is set
AND no config.json exists
WHEN entrypoint.sh runs `reeboot start --no-interactive`
THEN config.json is written with agent.model.provider="minimax"

## DH-2: REEBOOT_API_KEY env var flows into non-interactive config

GIVEN REEBOOT_API_KEY=mm-key is set
AND REEBOOT_PROVIDER=minimax is set
WHEN entrypoint.sh runs reeboot non-interactively
THEN config.json agent.model.apiKey="mm-key"

## DH-3: REEBOOT_MODEL env var flows into non-interactive config

GIVEN REEBOOT_MODEL=MiniMax-M1 is set
WHEN entrypoint.sh runs reeboot non-interactively
THEN config.json agent.model.id="MiniMax-M1"

## DH-4: REEBOOT_AGENTS_MD writes persona file before start

GIVEN REEBOOT_AGENTS_MD="You are a monitoring agent..."
WHEN entrypoint.sh runs
THEN ~/.reeboot/agent/AGENTS.md contains "You are a monitoring agent..."
AND this happens BEFORE reeboot start is called

## DH-5: REEBOOT_AUTH_MODE=pi sets authMode in non-interactive config

GIVEN REEBOOT_AUTH_MODE=pi is set
WHEN entrypoint.sh runs reeboot non-interactively
THEN config.json agent.model.authMode="pi"

## DH-6: non-interactive path writes authMode to config

GIVEN runWizard is called with interactive=false and authMode="own"
WHEN config is built and saved
THEN config.json contains agent.model.authMode="own"

## DH-7: existing config.json is not overwritten by entrypoint env vars

GIVEN a valid config.json already exists in mounted volume
AND REEBOOT_PROVIDER is set
WHEN entrypoint.sh runs
THEN existing config.json is used as-is (env vars are ignored)
AND reeboot starts without re-running setup
