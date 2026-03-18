## ADDED Requirements

### Requirement: Wizard guides user through all required setup steps
The setup wizard SHALL present a sequence of Inquirer prompts covering: (1) welcome message, (2) LLM provider selection, (3) API key input, (4) model selection, (5) channel selection (multi-select with `web` pre-selected), (6) agent name input (default "Reeboot"). Completing all steps SHALL write `~/.reeboot/config.json` and scaffold the directory structure.

#### Scenario: Wizard completes and writes config
- **WHEN** user completes all wizard prompts with valid inputs
- **THEN** `~/.reeboot/config.json` is created with the provided values and `loadConfig()` can parse it without error

#### Scenario: Wizard scaffolds directory structure
- **WHEN** wizard completes
- **THEN** the following paths exist: `~/.reeboot/contexts/global/`, `~/.reeboot/contexts/main/AGENTS.md`, `~/.reeboot/contexts/main/workspace/`, `~/.reeboot/contexts/main/.pi/extensions/`, `~/.reeboot/contexts/main/.pi/skills/`, `~/.reeboot/channels/`, `~/.reeboot/sessions/main/`

### Requirement: Non-interactive mode via CLI flags
The wizard SHALL support a `--no-interactive` flag combined with `--provider`, `--api-key`, `--model`, `--channels`, and `--name` flags that bypass all Inquirer prompts and write the config directly. This enables CI/scripting installs.

#### Scenario: Non-interactive setup writes config without prompts
- **WHEN** `reeboot setup --provider anthropic --api-key sk-test --model claude-sonnet-4-20250514 --channels web --no-interactive` is run
- **THEN** `~/.reeboot/config.json` is written with the specified values and the process exits 0 without any interactive prompts

### Requirement: Existing config is preserved unless user confirms overwrite
If `~/.reeboot/config.json` already exists and the wizard is run interactively, the wizard SHALL ask the user to confirm before overwriting. In non-interactive mode it SHALL overwrite silently.

#### Scenario: Existing config prompts for confirmation (interactive)
- **WHEN** `reeboot setup` is run and config already exists
- **THEN** wizard shows a confirm prompt before overwriting

#### Scenario: Non-interactive overwrites silently
- **WHEN** `reeboot setup --no-interactive [flags]` is run and config exists
- **THEN** config is overwritten without any confirmation prompt

### Requirement: AGENTS.md templates are scaffolded from bundled templates
The wizard SHALL copy `templates/global-agents.md` to `~/.reeboot/contexts/global/AGENTS.md` and `templates/main-agents.md` to `~/.reeboot/contexts/main/AGENTS.md` if the files don't already exist.

#### Scenario: Template files are scaffolded on first setup
- **WHEN** wizard completes and `~/.reeboot/contexts/main/AGENTS.md` does not yet exist
- **THEN** the file is created with the content from `templates/main-agents.md`

#### Scenario: Existing AGENTS.md is not overwritten
- **WHEN** wizard completes and `~/.reeboot/contexts/main/AGENTS.md` already exists
- **THEN** the existing file is left unchanged
