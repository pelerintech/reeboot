# Spec — Local Provider Environment Variables

## Capability

Four new environment variables are supported for local provider API keys: `OLLAMA_API_KEY`, `LLAMACPP_API_KEY`, `LM_STUDIO_API_KEY`, and `CUSTOM_API_KEY`. These are resolved by `resolveProviderEnvKey()` in pi-runner.ts as fallback sources when config.json doesn't contain an apiKey.

## Scenarios

### GIVEN OLLAMA_API_KEY is set in the environment
### WHEN resolveProviderEnvKey("ollama") is called
### THEN it returns the value of OLLAMA_API_KEY

---

### GIVEN LLAMACPP_API_KEY is set in the environment
### WHEN resolveProviderEnvKey("llamacpp") is called
### THEN it returns the value of LLAMACPP_API_KEY

---

### GIVEN LM_STUDIO_API_KEY is set in the environment
### WHEN resolveProviderEnvKey("lmstudio") is called
### THEN it returns the value of LM_STUDIO_API_KEY

---

### GIVEN CUSTOM_API_KEY is set in the environment
### WHEN resolveProviderEnvKey("custom") is called
### THEN it returns the value of CUSTOM_API_KEY

---

### GIVEN OLLAMA_API_KEY is set but the provider is "openai"
### WHEN resolveProviderEnvKey("openai") is called
### THEN it returns the value of OPENAI_API_KEY (not OLLAMA_API_KEY)

---

### GIVEN none of the local provider env vars are set
### WHEN resolveProviderEnvKey("ollama") is called
### THEN it returns an empty string

---

### GIVEN a provider not in the env var map
### WHEN resolveProviderEnvKey("unknown") is called
### THEN it returns an empty string

---

### GIVEN config.json has an apiKey for a local provider
### WHEN the key resolution logic runs
### THEN the config.json apiKey is used (not the env var)

---

### GIVEN config.json has no apiKey but the env var is set
### WHEN the key resolution logic runs
### THEN the env var value is used as fallback
