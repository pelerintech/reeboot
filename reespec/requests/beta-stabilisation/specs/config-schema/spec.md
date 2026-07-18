# Config schema — sdk + ree fields

## Capability

The Zod ConfigSchema declares `sdk` and `ree` fields so they survive `loadConfig()`.

## Scenarios

### S1: Config with sdk: "ree" creates a ree runner

GIVEN a config JSON with `"sdk": "ree"` AND valid `ree` and `agent` sections
WHEN `loadConfig(configPath)` is called
THEN the returned config has `sdk === "ree"`

GIVEN a parsed config with `sdk === "ree"`
WHEN `createRunner(context, config)` is called
THEN it returns a `ReeAgentRunner` (not a `PiAgentRunner`)

### S2: Default sdk is "pi"

GIVEN a config JSON with no `sdk` field
WHEN `loadConfig(configPath)` is called
THEN the returned config has `sdk === "pi"`

### S3: ree section is fully typed, not any-cast

GIVEN a config JSON with `"ree": { "maxChats": 50, "idleTtlMs": 60000 }`
WHEN parsed through `loadConfig`
THEN `config.ree.maxChats` is typed `number`, not accessed via `(config as any).ree`

### S4: Backward compatibility — existing pi configs are unchanged

GIVEN a config JSON without `sdk` or `ree` fields (a pre-existing pi config)
WHEN `loadConfig(configPath)` is called
THEN the returned config has `sdk === "pi"`, `ree` is the default ReeConfig, and all existing pi fields are preserved unchanged

### S5: ree.model falls back to agent.model when absent

GIVEN a parsed config with `sdk === "ree"` but no `ree.model` field
WHEN `ReeRuntime.createTanStackClient()` reads the model config
THEN it falls back to `config.agent.model` — same as before, but through typed access (not `(config as any)` cast)
