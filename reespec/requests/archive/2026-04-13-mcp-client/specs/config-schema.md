# Spec: Config Schema

## Capability
`mcp.servers` is parsed from `config.json` and validated by the ConfigSchema.

---

## Scenarios

### GIVEN a config.json with a valid mcp.servers entry
WHEN `loadConfig()` is called
THEN the returned config has `mcp.servers[0].name`, `.command`, `.args`, `.env` populated correctly

### GIVEN a config.json with no `mcp` key
WHEN `loadConfig()` is called
THEN `config.mcp.servers` is an empty array (default)

### GIVEN a config.json with a server missing required `name` field
WHEN `loadConfig()` is called
THEN a ZodError is thrown

### GIVEN a config.json with a server missing required `command` field
WHEN `loadConfig()` is called
THEN a ZodError is thrown

### GIVEN a server entry with no `args` or `env`
WHEN `loadConfig()` is called
THEN `args` defaults to `[]` and `env` defaults to `{}`
