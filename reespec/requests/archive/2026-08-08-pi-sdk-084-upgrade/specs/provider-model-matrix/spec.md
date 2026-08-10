# Capability: provider→model construction matrix

Reeboot owns construction of the `Model` for its full provider set — standard cloud, custom /
OpenAI-compatible with their own `baseUrl`, and local providers — and thereby closes the latent
`baseUrl` gap in the pi path.

## Scenarios

### The baseUrl gap is closed

GIVEN reeboot config sets `agent.model.baseUrl` (or a provider with a `baseUrl`) in `'own'` mode
WHEN the Model is constructed
THEN the Model's request config carries that `baseUrl`
AND the constructed options passed to `createAgentSession` reflect it (the value is no longer
declared-but-dropped).

### A custom/OpenAI-compatible provider builds with baseUrl + optional key

GIVEN `agent.model.provider` is a custom/OpenAI-compatible provider with a `baseUrl` and optionally an `apiKey`
WHEN the provider→model construction runs
THEN a usable Model is produced carrying the `baseUrl` (and the key when present).

### A local provider builds keyless

GIVEN `agent.model.provider` is a local provider (`ollama`, `lmstudio`, `llamacpp`) with a `baseUrl`
WHEN the provider→model construction runs
THEN a usable Model is produced without requiring an API key, carrying the `baseUrl`.

### Construction is centralized

GIVEN the provider matrix
WHEN the code is inspected
THEN model construction for all providers lives behind a single narrow helper (e.g.
`buildModelFromConfig`), not duplicated inline in `PiAgentRunner`.
