# Spec — config.example.json

## Capability

A `config.example.json` at the repo root documents every ConfigSchema key with defaults and inline comments. The file is valid JSON — `ConfigSchema.parse()` accepts it. The user copies it to `./data/config.json`, edits, and starts.

## Scenarios

### GIVEN config.example.json exists at repo root
WHEN the file is parsed with `JSON.parse`
THEN parsing succeeds (valid JSON — no comment syntax that breaks `JSON.parse`)

### GIVEN config.example.json is loaded with `ConfigSchema.parse()`
WHEN any extra keys are present (e.g. `"$comment"`)
THEN parsing succeeds (Zod strips unknown keys by default)

### GIVEN config.example.json has default values
WHEN compared against `ConfigSchema.parse({})` (the code defaultConfig)
THEN all top-level sections (`agent`, `channels`, `search`, `memory`, `knowledge`, `budget`, `resilience`, `logging`, `heartbeat`, `skills`, `mcp`, `permissions`, `security`, `contexts`) are present

### GIVEN the user copies config.example.json to ./data/config.json
WHEN `docker compose up -d` runs
THEN reeboot starts and loads the config successfully
(no schema validation errors from the example structure)

### GIVEN config.example.json has `search.searxngBaseUrl`
WHEN the value is inspected
THEN it is `"http://searxng:8080"` — using the Docker DNS name, not `localhost:8888`

### GIVEN config.example.json has `channels.signal.apiPort`
WHEN the value is inspected
THEN it is `8080` — matching the signal-cli container's internal port