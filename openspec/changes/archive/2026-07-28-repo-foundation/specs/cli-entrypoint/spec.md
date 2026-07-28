## ADDED Requirements

### Requirement: CLI binary is available after install
The package SHALL expose a `reeboot` binary in `package.json#bin` pointing to `dist/index.js`. Running `npx reeboot` or `reeboot <cmd>` after install SHALL work without any additional configuration steps.

#### Scenario: Binary entry point executes
- **WHEN** user runs `reeboot --help`
- **THEN** the CLI prints usage information and exits with code 0

#### Scenario: npx invocation works
- **WHEN** user runs `npx reeboot --help` on a machine without reeboot installed globally
- **THEN** npx downloads and executes the package, printing usage information

### Requirement: Top-level sub-commands are registered
The CLI SHALL register the following top-level commands via Commander: `start`, `setup`, `doctor`, `status`, `reload`, `restart`, `install <package>`, `uninstall <package>`, `packages list`, `channels list`, `channels login <type>`, `channels logout <type>`, `contexts list`, `contexts create <name>`, `sessions list`. Commands not yet implemented SHALL output a "not yet implemented" message and exit 0.

#### Scenario: Known command executes without crash
- **WHEN** user runs `reeboot status`
- **THEN** CLI runs the status handler without throwing an unhandled error

#### Scenario: Unknown command reports error
- **WHEN** user runs `reeboot unknowncmd`
- **THEN** CLI prints an error and exits with a non-zero code

### Requirement: First-run wizard is triggered automatically
The CLI SHALL detect the absence of `~/.reeboot/config.json` when `reeboot start` is invoked without arguments and automatically launch the interactive setup wizard instead of crashing.

#### Scenario: No config triggers wizard
- **WHEN** user runs `reeboot start` and `~/.reeboot/config.json` does not exist
- **THEN** the setup wizard starts interactively

#### Scenario: Existing config skips wizard
- **WHEN** user runs `reeboot start` and `~/.reeboot/config.json` exists
- **THEN** the agent starts normally without launching the wizard

### Requirement: `--setup` flag forces wizard
The `reeboot setup` command SHALL launch the setup wizard unconditionally, even if a config already exists.

#### Scenario: Setup command always runs wizard
- **WHEN** user runs `reeboot setup`
- **THEN** the interactive setup wizard starts regardless of whether a config already exists
