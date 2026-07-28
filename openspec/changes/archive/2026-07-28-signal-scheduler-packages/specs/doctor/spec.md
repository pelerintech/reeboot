## ADDED Requirements

### Requirement: reeboot doctor runs a comprehensive pre-flight check
`reeboot doctor` SHALL run each check, print a ✓/✗/⚠ result with an actionable fix message for failures, and exit 0 if all pass (or only warnings), exit 1 if any fail.

#### Scenario: All checks pass exits 0
- **WHEN** all doctor checks pass
- **THEN** CLI prints all ✓ results and exits with code 0

#### Scenario: One check fails exits 1
- **WHEN** at least one doctor check fails
- **THEN** CLI prints the ✗ result with fix instructions and exits with code 1

### Requirement: Doctor checks config validity
Doctor SHALL attempt to call `loadConfig()`. If it throws, the check fails with the Zod error message.

#### Scenario: Config check passes for valid config
- **WHEN** `~/.reeboot/config.json` is valid
- **THEN** "✓ Config: valid" is printed

#### Scenario: Config check fails for invalid config
- **WHEN** `~/.reeboot/config.json` has a schema violation
- **THEN** "✗ Config: <error> → Fix: edit ~/.reeboot/config.json" is printed

### Requirement: Doctor checks all configured extensions load
Doctor SHALL call `createLoader()` and `loader.reload()` in a dry-run mode, capturing any extension load errors.

#### Scenario: Extension load check passes
- **WHEN** all extensions load without errors
- **THEN** "✓ Extensions: all loaded (<n> extensions)" is printed

### Requirement: Doctor checks API key validity with a live ping
Doctor SHALL make a minimal API call to the configured provider to verify the API key is valid. For Anthropic: send a 1-token request. Uses an exponential backoff if rate limited (max 2 retries).

#### Scenario: Valid API key passes
- **WHEN** the configured API key is valid
- **THEN** "✓ API key: valid (anthropic)" is printed

#### Scenario: Invalid API key fails
- **WHEN** the API key returns 401
- **THEN** "✗ API key: invalid → Fix: run 'reeboot setup' to update your API key" is printed

### Requirement: Doctor checks Signal Docker image version
If Signal channel is configured and enabled, doctor SHALL check the running `signal-cli-rest-api` Docker image version against the latest available tag and warn if outdated.

#### Scenario: Outdated Signal image warns
- **WHEN** running signal-cli-rest-api image version is not the latest
- **THEN** "⚠ Signal: image outdated (running vX, latest vY) → Fix: reeboot channels login signal" is printed

### Requirement: Doctor checks available disk space
Doctor SHALL check that `~/.reeboot/` has at least 1GB of free disk space. Below 1GB is a warning; below 100MB is a failure.

#### Scenario: Low disk space warns
- **WHEN** available disk space is between 100MB and 1GB
- **THEN** "⚠ Disk: low space (<n>MB free)" is printed
