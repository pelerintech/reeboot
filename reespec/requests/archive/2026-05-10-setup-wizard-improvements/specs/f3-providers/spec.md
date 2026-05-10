# Spec — F3: Private-first provider ordering + local inference

## Capability

Local providers (Ollama, llama.cpp, LM Studio, Custom) appear first in the provider
list. Models are auto-detected for local providers and fetched live for cloud providers,
with static fallback. Cloud flow is reordered to provider → API key → model.

## Scenarios

### GIVEN the provider select step
### WHEN the choices are rendered
### THEN Ollama appears before Anthropic in the list
### AND a visual separator divides local from cloud providers

---

### GIVEN the user selects "llama.cpp"
### WHEN the base URL step runs
### THEN "http://localhost:8080/v1" is the pre-filled default

---

### GIVEN the user selects "LM Studio"
### WHEN the base URL step runs
### THEN "http://localhost:1234/v1" is the pre-filled default

---

### GIVEN the user selects a local provider and the server is reachable
### WHEN the models step runs
### THEN detected models are shown as a select list

---

### GIVEN the user selects a local provider and the server is NOT reachable
### WHEN the models step runs
### THEN a warning is shown ("server not reachable")
### AND a plain text input is shown for manual model ID entry

---

### GIVEN the user selects a cloud provider (e.g. Anthropic)
### WHEN the steps run
### THEN the order is: provider → API key → model

---

### GIVEN the user enters a valid API key for a cloud provider
### WHEN the model fetch succeeds
### THEN the live models list is shown as a select

---

### GIVEN the user enters an API key and the model fetch fails or times out
### WHEN the model step runs
### THEN the static curated fallback list is shown
### AND a warning note is displayed

---

### GIVEN the user selects OpenRouter
### WHEN the provider step runs
### THEN the models list is fetched immediately (no API key required for the public endpoint)
### AND the user still enters the API key before selecting a model (unified cloud flow)
### AND the live model list is shown using the pre-fetched results (no second fetch needed)
