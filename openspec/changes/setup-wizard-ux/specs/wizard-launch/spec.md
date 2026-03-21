## ADDED Requirements

### Requirement: Step 4 shows configuration summary and offers to start agent
After all setup steps, the wizard SHALL display a summary table showing provider, model, agent name, channels (with ✓/✗), and search provider. It SHALL then ask "Start your agent now?" with Yes as default.

#### Scenario: Summary shows correct values
- **WHEN** wizard completes with Anthropic / claude-sonnet-4-5 / "Reeboot" / WhatsApp linked / DDG
- **THEN** summary displays all five values correctly

#### Scenario: User chooses to start now
- **WHEN** user selects "Yes, start now"
- **THEN** config is written atomically then agent starts (same as `reeboot start`)

#### Scenario: User chooses not to start
- **WHEN** user selects "No, I'll run `reeboot start` later"
- **THEN** config is written, "Run `reeboot start` when ready." is printed, wizard exits

### Requirement: Config is written atomically at the end only
The wizard SHALL NOT write any config file until Step 4 is complete. Config SHALL be written using the atomic write (temp file + rename) pattern. If the wizard exits at any point before Step 4 completes (Ctrl+C, error), no config file is created or modified.

#### Scenario: Ctrl+C before Step 4 — no config written
- **WHEN** wizard is interrupted (simulated) before the final write
- **THEN** `~/.reeboot/config.json` does not exist after the interrupted run

#### Scenario: Successful completion writes valid config
- **WHEN** wizard completes all steps successfully
- **THEN** `~/.reeboot/config.json` is a valid JSON file parseable by `loadConfig()`
- **THEN** all wizard answers are reflected in the written config

### Requirement: WebChat port shown in launch output
When agent starts from wizard, the WebChat URL SHALL be shown in the launch output.

#### Scenario: WebChat URL shown on start
- **WHEN** agent starts after wizard completes
- **THEN** "✓ WebChat ready at http://localhost:3000" is printed to stdout
