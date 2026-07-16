# Entrypoint — remove env-var config generation

## Capability

The Docker entrypoint has one path: if config.json exists, start; if not, error with instructions.

## Scenarios

### S1: Config exists — start directly

GIVEN a container with `~/.reeboot/config.json` present
WHEN the entrypoint runs
THEN it executes `node dist/index.js start --no-interactive` directly — no env var translation, no wizard

### S2: Config missing — print error and exit 1

GIVEN a container with no `~/.reeboot/config.json`
WHEN the entrypoint runs
THEN it prints an error message containing the words "Error: No config.json found" and "mount your config" AND exits with code 1

### S3: REEBOOT_AGENTS_MD is still written before start

GIVEN `REEBOOT_AGENTS_MD` is set AND config.json exists
WHEN the entrypoint runs
THEN `~/.reeboot/agent/AGENTS.md` contains the injected content AND the server starts

### S4: REEBOOT_HOST is still honoured

GIVEN `REEBOOT_HOST=0.0.0.0` is set AND config.json exists
WHEN the entrypoint runs
THEN the process has `REEBOOT_HOST=0.0.0.0` in its environment (the server reads this env var for bind address)
