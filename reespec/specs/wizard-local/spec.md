# Spec — Wizard Local Provider Support

## Capability

The provider step prompts for an API key for local providers (ollama, llamacpp, lmstudio, custom), pre-filled with "sk-local-proxy". It appends a new provider entry to config.json's providers array instead of overwriting. The generated models.json uses the correct provider name and includes the api field.

## Scenarios

### GIVEN the user selects "Ollama (local)" in the provider step
### WHEN the wizard runs
### THEN an API key prompt is shown with "sk-local-proxy" as the default value

---

### GIVEN the user accepts the default API key for a local provider
### WHEN the wizard completes
### THEN config.json is updated with a new provider entry (not overwritten)

---

### GIVEN the user enters a custom API key for a local provider
### WHEN the wizard completes
### THEN the custom key is stored in the provider entry

---

### GIVEN an existing config.json with one provider entry
### WHEN the wizard adds a second local provider
### THEN the existing entry is preserved and the new one is prepended (becomes first)

---

### GIVEN the wizard is run and the user marks the new provider as default
### WHEN config.json is written
### THEN the new provider has default: true and the previous default is set to false

---

### GIVEN the wizard is run and the user does NOT mark the new provider as default
### WHEN config.json is written
### THEN the existing default provider retains default: true

---

### GIVEN the user selects "Custom OpenAI-compatible endpoint"
### WHEN the wizard completes
### THEN the provider entry has provider: "custom", api: "openai-completions", and the user-entered baseUrl

---

### GIVEN the wizard writes models.json for a local provider
### WHEN the file is read and parsed
### THEN the provider key matches the selected provider name (not hardcoded "ollama")

---

### GIVEN the wizard writes models.json for a local provider
### WHEN the file is read and parsed
### THEN the entry includes "api": "openai-completions"

---

### GIVEN the wizard writes models.json for a local provider
### WHEN the file is read and parsed
### THEN the entry includes the user-provided apiKey (or "sk-local-proxy" if accepted)
