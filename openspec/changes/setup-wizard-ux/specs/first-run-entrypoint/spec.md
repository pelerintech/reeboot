## ADDED Requirements

### Requirement: No-args command routes based on config presence
When `reeboot` is invoked with no subcommand, the CLI SHALL check whether `~/.reeboot/config.json` exists (or the path set by `REEBOOT_CONFIG_PATH`). If the file does not exist, the wizard SHALL be launched. If the file exists, the agent SHALL start immediately.

#### Scenario: Config missing — wizard launches
- **WHEN** user runs `reeboot` and `~/.reeboot/config.json` does not exist
- **THEN** the first-run wizard starts (same as `reeboot setup`)

#### Scenario: Config present — agent starts
- **WHEN** user runs `reeboot` and `~/.reeboot/config.json` exists
- **THEN** the agent starts (same as `reeboot start`)

#### Scenario: Config path overridable for tests
- **WHEN** `REEBOOT_CONFIG_PATH` env var is set
- **THEN** that path is used instead of `~/.reeboot/config.json` for the existence check

### Requirement: `reeboot setup` re-runs wizard with overwrite confirmation
`reeboot setup` SHALL always run the wizard. If a config already exists, it SHALL prompt "Config already exists. Overwrite? (y/N)" before proceeding. If user declines, wizard exits without changes.

#### Scenario: Fresh setup
- **WHEN** user runs `reeboot setup` and no config exists
- **THEN** wizard starts immediately, no overwrite prompt shown

#### Scenario: Re-run with existing config — user confirms
- **WHEN** user runs `reeboot setup`, config exists, user answers Y
- **THEN** wizard runs and overwrites config on completion

#### Scenario: Re-run with existing config — user declines
- **WHEN** user runs `reeboot setup`, config exists, user answers N
- **THEN** wizard exits, existing config is untouched

### Requirement: Wizard is injectable for testing
The wizard function SHALL accept a `prompter` dependency injection parameter. When not provided, it defaults to the real `InquirerPrompter`. Tests pass a `FakePrompter` with preset answers to drive the full flow without a TTY.

#### Scenario: Fake prompter drives wizard to completion
- **WHEN** wizard is called with a `FakePrompter` that has preset answers for all steps
- **THEN** wizard completes and returns a valid config draft without any real TTY interaction

#### Scenario: Fake prompter can simulate timeout on QR step
- **WHEN** `FakePrompter` simulates a WhatsApp QR timeout
- **THEN** wizard records WhatsApp as unlinked and continues to the next step
