# Brief — Local Endpoints

## Problem

reeboot's config.json has no effect on model selection. When `authMode: "own"` is set, pi-runner passes provider/model to pi's SettingsManager, but pi's ModelRegistry reads from `~/.reeboot/agent/models.json`. Without a models.json entry matching the config, pi silently falls through to its built-in fallback chain — using a different model than the user configured.

Currently, the wizard writes models.json once at setup (with a bug: it hardcodes `"ollama"` as the provider key regardless of what the user selected), and there is no startup regeneration. The user must manually edit both config.json and models.json to add local endpoints, and even then the provider names must match exactly.

## Goals

1. **config.json is the source of truth.** Users edit config.json and restart — reeboot handles the rest. No manual models.json editing ever needed.
2. **Support multiple local providers.** Ollama, llama.cpp, LM Studio, and arbitrary OpenAI-compatible custom endpoints (LiteLLM, vLLM, etc.) — all configurable through config.json.
3. **Wizard appends, never overwrites.** Running `reeboot setup` again adds a new provider entry without destroying existing config.
4. **models.json is regenerated at startup.** It survives deletion, stays in sync with config.json, and is only written when `authMode: "own"`.
5. **API key is always configured.** Local providers that don't require auth use a dummy key (`sk-local-proxy`). The wizard prompts for it but pre-fills so users can accept.

## Non-goals

- `authMode: "pi"` passthrough — this mode delegates entirely to pi's own `~/.pi/agent/models.json`. reeboot does not touch it.
- Multi-provider switching at runtime — only one provider is active at a time (the one marked `default: true`).
- Dynamic provider registration via extensions — models.json generation is a startup concern only.
- Custom stream handlers — all local endpoints use `"api": "openai-completions"` since they are OpenAI-compatible.

## Impact

- Users can configure local inference (LM Studio, llama.cpp, LiteLLM proxy, vLLM) through config.json
- The wizard becomes usable for local providers instead of silently broken
- No more manual models.json editing
- Backward compatible: existing flat `provider`/`id`/`apiKey` fields in config.json are auto-migrated
