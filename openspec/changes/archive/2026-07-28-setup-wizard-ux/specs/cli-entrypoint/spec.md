## MODIFIED Requirements

### Requirement: Default command (no subcommand) routes to wizard or start
The `reeboot` CLI SHALL route the no-subcommand invocation based on config state rather than printing help. When `~/.reeboot/config.json` is absent, it SHALL run the setup wizard. When it is present, it SHALL start the agent. The `--help` flag SHALL still print help text in all cases.

#### Scenario: No config — wizard starts
- **WHEN** `reeboot` is run with no args and config does not exist
- **THEN** wizard runs (first-run experience)

#### Scenario: Config present — agent starts
- **WHEN** `reeboot` is run with no args and config exists
- **THEN** agent starts (equivalent to `reeboot start`)

#### Scenario: Help flag always works
- **WHEN** `reeboot --help` is run regardless of config state
- **THEN** help text is printed and process exits 0
