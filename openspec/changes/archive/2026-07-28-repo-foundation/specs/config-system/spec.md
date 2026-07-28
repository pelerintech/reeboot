## ADDED Requirements

### Requirement: Config is loaded from ~/.reeboot/config.json
The config system SHALL read `~/.reeboot/config.json` at startup. If the file does not exist it SHALL return the default config object. If the file exists but is invalid JSON or fails Zod validation it SHALL throw a descriptive error identifying the invalid field.

#### Scenario: Valid config file is loaded
- **WHEN** `~/.reeboot/config.json` contains a valid config object
- **THEN** `loadConfig()` returns a fully-typed config object with all values from the file

#### Scenario: Missing config returns defaults
- **WHEN** `~/.reeboot/config.json` does not exist
- **THEN** `loadConfig()` returns the default config object without error

#### Scenario: Invalid JSON throws descriptive error
- **WHEN** `~/.reeboot/config.json` contains malformed JSON
- **THEN** `loadConfig()` throws an error with the message "Failed to parse config: <detail>"

#### Scenario: Schema violation throws descriptive error
- **WHEN** `~/.reeboot/config.json` contains a field with the wrong type (e.g. `channels.web.port` is a string)
- **THEN** `loadConfig()` throws a Zod validation error naming the offending path

### Requirement: Defaults are applied for missing optional fields
The config system SHALL apply sensible defaults for any optional fields not present in the file. Required fields (e.g. `agent.model.provider`, `agent.model.id`, `agent.model.apiKey`) SHALL be required unless the setup wizard has not yet run.

#### Scenario: Partial config is merged with defaults
- **WHEN** config file only contains `{ "agent": { "name": "Hal" } }`
- **THEN** `loadConfig()` returns an object with `channels.web.enabled = true`, `channels.web.port = 3000`, `sandbox.mode = "os"`, etc.

### Requirement: Environment variable overrides
The config system SHALL allow specific fields to be overridden by environment variables: `REEBOOT_PORT` → `channels.web.port`, `REEBOOT_LOG_LEVEL` → `logging.level`, `REEBOOT_API_TOKEN` → `server.token`.

#### Scenario: Env var overrides config file value
- **WHEN** `REEBOOT_PORT=4000` is set and config file has `channels.web.port = 3000`
- **THEN** `loadConfig()` returns `channels.web.port = 4000`

### Requirement: Config is serializable back to disk
The config system SHALL expose a `saveConfig(config)` function that writes a validated config object back to `~/.reeboot/config.json` atomically (write to temp file, then rename).

#### Scenario: Config is saved atomically
- **WHEN** `saveConfig(config)` is called
- **THEN** `~/.reeboot/config.json` is updated and the file is valid JSON readable by `loadConfig()`
