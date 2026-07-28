## MODIFIED Requirements

### Requirement: reeboot doctor is fully implemented
`reeboot doctor` SHALL run all diagnostic checks (config, extensions, API key, channels, signal Docker version, disk space) and print structured ✓/✗/⚠ results. Exit 0 on all pass/warn, exit 1 on any failure.

#### Scenario: Doctor runs all checks
- **WHEN** `reeboot doctor` is run
- **THEN** each defined check produces a result line

### Requirement: reeboot install, uninstall, packages list are fully implemented
`reeboot install npm:<package>`, `reeboot uninstall <name>`, and `reeboot packages list` are fully implemented per the package-system spec (replacing previous stubs).

#### Scenario: Install prints reload reminder
- **WHEN** `reeboot install npm:<valid-package>` completes
- **THEN** CLI prints "Installed. Run 'reeboot reload' to activate."

### Requirement: reeboot start --daemon is implemented
`reeboot start --daemon` generates and registers the appropriate service unit per the daemon-mode spec.

#### Scenario: Daemon flag generates service file
- **WHEN** `reeboot start --daemon` is run
- **THEN** the appropriate service file is created on disk

### Requirement: Error handling for LLM rate limits and provider outages
When the agent runner returns an error event with a rate-limit or provider-down status, the orchestrator SHALL send the user a message like "Rate limited — retrying in 30s" or "LLM provider unavailable. Try again later." and not crash the process.

#### Scenario: Rate limit error notifies user and retries
- **WHEN** the LLM provider returns a rate-limit response
- **THEN** user receives a notification and the orchestrator retries with exponential backoff (max 3 attempts)

### Requirement: Long-running turns timeout after configurable duration
If a turn exceeds `config.agent.turnTimeout` (default 300,000ms / 5 min), the orchestrator SHALL call `runner.abort()` and send "Your request timed out." to the user.

#### Scenario: Turn timeout aborts and notifies
- **WHEN** a turn runs for longer than turnTimeout milliseconds
- **THEN** abort is called and user receives timeout message
