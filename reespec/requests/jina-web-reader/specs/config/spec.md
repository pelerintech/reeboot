# Spec — Jina config block

## Capability

A new `config.web` block exists with `jina_base_url`, `enabled`, and `default_engine`
fields. An empty `jina_base_url` means "no sidekick" (the self-contained baseline).
A set value means "sidekick expected here".

## Scenarios

### GIVEN a config with no `web` block
WHEN the config is parsed
THEN `config.web` exists with defaults `{ jina_base_url: '', enabled: true, default_engine: 'auto' }`

### GIVEN a config with `web.jina_base_url: 'http://localhost:3000'`
WHEN the config is parsed
THEN `config.web.jina_base_url === 'http://localhost:3000'`
AND `config.web.enabled === true`

### GIVEN a config with `web.jina_base_url: 'http://localhost:3000'` and `web.enabled: false`
WHEN the config is parsed
THEN `config.web.enabled === false`

### GIVEN a config with an invalid `web.default_engine` value
WHEN the config is parsed
THEN parsing fails (zod enum rejection)

### GIVEN existing config that previously had no `web` key
WHEN config is migrated/loaded
THEN the previously-valid config still parses (the new block is optional/backward-compatible)
