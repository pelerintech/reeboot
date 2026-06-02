# Changelog

## v2.6.0 — Local Endpoints & Multi-Provider Support

### Added

- **`baseUrl` and `api` fields** in `agent.model` config for OpenAI-compatible endpoints
- **`providers` array** in `agent.model` for multi-provider support — configure Ollama, llama.cpp, LM Studio, and custom endpoints alongside cloud providers
- **Startup `models.json` generation** — reeboot now generates `~/.reeboot/agent/models.json` at startup from config.json when `authMode: "own"`. No manual editing needed.
- **Backward-compatible migration** — existing flat `provider`/`id`/`apiKey` fields are automatically migrated to the `providers` array on first load
- **Local provider environment variables** — `OLLAMA_API_KEY`, `LLAMACPP_API_KEY`, `LM_STUDIO_API_KEY`, `CUSTOM_API_KEY` for key resolution
- **Wizard API key prompt for local providers** — the setup wizard now prompts for an API key (pre-filled with `sk-local-proxy`) for all local providers
- **Wizard prepend mode** — running the wizard again prepends a new provider to the existing list instead of overwriting

### Changed

- **Wizard uses actual provider name** — `models.json` now uses the correct provider key (e.g., `"lmstudio"`) instead of hardcoded `"ollama"`
- **Wizard includes `api` field** — generated `models.json` now includes `"api": "openai-completions"` for proper stream handler selection

### Defaults

- `baseUrl` defaults per provider: Ollama → `http://localhost:11434/v1`, llama.cpp → `http://localhost:8080/v1`, LM Studio → `http://localhost:1234/v1`
- `apiKey` defaults to `"sk-local-proxy"` for local providers when not set
- `api` defaults to `"openai-completions"` for all providers
