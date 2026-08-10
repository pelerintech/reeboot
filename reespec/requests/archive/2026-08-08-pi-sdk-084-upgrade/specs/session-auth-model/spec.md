# Capability: session auth & model construction ('own' mode)

Reeboot's `PiAgentRunner` migrates onto the `0.84` session-auth surface: the `'own'` (default,
production) path constructs a resolved `Model` from reeboot's config and passes it to
`createAgentSession({ model })`, replacing the removed `authStorage`/`modelRegistry` options.

## Scenarios

### createAgentSession no longer receives authStorage/modelRegistry

GIVEN a PiAgentRunner is created in `authMode === 'own'`
WHEN `_getOrCreateSession()` builds session options
THEN the options passed to `createAgentSession` do NOT contain `authStorage` or `modelRegistry`
AND they DO contain `model` (the resolved Model from reeboot's config) and the retained
`cwd`/`resourceLoader`/`sessionManager`/`settingsManager`.

### The own-mode model carries reeboot's key

GIVEN reeboot config sets a provider and `apiKey` (or the provider's env var is set)
WHEN the resolved Model is built in `'own'` mode
THEN the Model's request config carries the resolved API key
AND key resolution still prefers `config.apiKey`, falling back to the provider env var via
`resolveProviderEnvKey`.

### Standard cloud provider builds a valid model

GIVEN `agent.model.provider` is a standard cloud provider (anthropic, openai, groq, xai) with an id and key
WHEN the provider→model construction runs
THEN a usable `Model` is produced for that provider+id and is passed to `createAgentSession`.

### Legacy mocks are migrated

GIVEN the pi-runner test suite mocks `@earendil-works/pi-coding-agent`
WHEN the migration lands
THEN the mock stubs `ModelRuntime` (and the Model construction) instead of `AuthStorage`/`ModelRegistry`
AND all pi-runner lifecycle/tool-scanning/isolation tests assert behavior through the new surface and pass.
