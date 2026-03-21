## ADDED Requirements

### Requirement: Provider selection shows 8 options with curated model lists
The wizard SHALL present exactly 8 providers: Anthropic, OpenAI, Google, Groq, Mistral, xAI, OpenRouter, Ollama. Each non-Ollama provider SHALL show a curated list of 2–4 models with a recommended default. The "other" option SHALL NOT appear; a note about custom providers via `config.json` SHALL be shown.

#### Scenario: User selects Anthropic
- **WHEN** user selects Anthropic and then selects claude-sonnet-4-5
- **THEN** config draft has `agent.model.provider = "anthropic"` and `agent.model.id = "claude-sonnet-4-5"`

#### Scenario: User selects OpenAI
- **WHEN** user selects OpenAI and then selects gpt-4o
- **THEN** config draft has `agent.model.provider = "openai"` and `agent.model.id = "gpt-4o"`

#### Scenario: Curated lists include recommended marker
- **WHEN** provider model list is shown
- **THEN** the first/recommended model is marked `[recommended]`

### Requirement: API key prompt shown for all non-Ollama providers
After provider + model selection, the wizard SHALL prompt for the API key. The key SHALL be stored in `config.agent.model.apiKey`. A note SHALL inform the user they can also set the env var instead (e.g. `ANTHROPIC_API_KEY`).

#### Scenario: API key stored in config
- **WHEN** user enters API key `sk-ant-abc123`
- **THEN** config draft has `agent.model.apiKey = "sk-ant-abc123"`

#### Scenario: Empty API key not accepted
- **WHEN** user submits an empty string as API key
- **THEN** wizard re-prompts for the key with a validation message

### Requirement: Ollama prompts for base URL and model ID, writes models.json
When Ollama is selected, the wizard SHALL skip the API key prompt. Instead it SHALL prompt for:
1. Base URL (default `http://localhost:11434/v1`)
2. Model ID (free text, hint: "run `ollama list` to see available models")

It SHALL write `~/.reeboot/models.json` with the Ollama provider definition and set `config.agent.model.provider = "ollama"` and `config.agent.model.id = <entered model>`.

#### Scenario: Ollama default URL accepted
- **WHEN** user selects Ollama and presses Enter on the URL prompt
- **THEN** base URL is `http://localhost:11434/v1`

#### Scenario: Ollama custom URL entered
- **WHEN** user selects Ollama and enters `http://192.168.1.5:11434/v1`
- **THEN** `models.json` has `baseUrl = "http://192.168.1.5:11434/v1"`

#### Scenario: Ollama models.json written correctly
- **WHEN** user selects Ollama with model `qwen2.5:7b`
- **THEN** `~/.reeboot/models.json` contains a valid Ollama provider block with `"id": "qwen2.5:7b"`

#### Scenario: Ollama model ID cannot be empty
- **WHEN** user submits an empty model ID
- **THEN** wizard re-prompts with a validation message

### Requirement: Agent name prompt with default "Reeboot"
After provider setup, the wizard SHALL prompt for agent name with default `Reeboot`. The name SHALL be stored in `config.agent.name`.

#### Scenario: Default name accepted
- **WHEN** user presses Enter without typing a name
- **THEN** config draft has `agent.name = "Reeboot"`

#### Scenario: Custom name entered
- **WHEN** user types `Alfred`
- **THEN** config draft has `agent.name = "Alfred"`
