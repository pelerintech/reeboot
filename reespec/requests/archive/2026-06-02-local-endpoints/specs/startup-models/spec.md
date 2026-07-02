# Spec — Startup models.json Generation

## Capability

At startup, reeboot reads config.json and generates `~/.reeboot/agent/models.json` for `authMode: "own"`. It selects the provider marked `default: true` (or the first one if none is marked). The generated models.json includes `baseUrl`, `api`, `apiKey`, and `models` fields. When `authMode: "pi"`, no models.json is generated.

## Scenarios

### GIVEN a config with authMode: "own" and one default provider
### WHEN generateModelsJson() is called
### THEN it returns a JSON string with the provider entry containing baseUrl, api, apiKey, and models

---

### GIVEN a config with authMode: "own" and multiple providers, one marked default
### WHEN generateModelsJson() is called
### THEN only the default provider is included in the output

---

### GIVEN a config with authMode: "own" and multiple providers, none marked default
### WHEN generateModelsJson() is called
### THEN the first provider in the array is used

---

### GIVEN a config with authMode: "pi"
### WHEN generateModelsJson() is called
### THEN it returns null (no models.json generated)

---

### GIVEN a config with authMode: "own" and an empty providers array
### WHEN generateModelsJson() is called
### THEN it returns null (no providers to generate from)

---

### GIVEN a config with a local provider missing baseUrl
### WHEN generateModelsJson() is called
### THEN it applies a sensible default based on the provider name (ollama→http://localhost:11434/v1, llamacpp→http://localhost:8080/v1, lmstudio→http://localhost:1234/v1)

**Note:** Defaults are full URLs with `/v1` suffix, not bare `host:port`. This matches the OpenAI-compatible API endpoint convention used by all local providers.

---

### GIVEN a config with a custom provider missing baseUrl
### WHEN generateModelsJson() is called
### THEN it applies a default of http://localhost:11434/v1

---

### GIVEN a config with a provider missing apiKey
### WHEN generateModelsJson() is called
### THEN it uses "sk-local-proxy" as the default apiKey

---

### GIVEN a config with a provider where baseUrl is explicitly set to empty string
### WHEN generateModelsJson() is called
### THEN it still applies the sensible default (empty string is treated as "not set")

---

### GIVEN generateModelsJson() returns a JSON string
### WHEN the string is written to ~/.reeboot/agent/models.json and parsed
### THEN the resulting object has a "providers" key with one entry matching the active provider

---

**Note:** The final scenario ("generated models.json is loaded by pi's ModelRegistry") is deferred — it depends on pi's internal ModelRegistry behavior, which is outside reeboot's scope. The user is responsible for entering a valid model name that matches what their local provider serves.
