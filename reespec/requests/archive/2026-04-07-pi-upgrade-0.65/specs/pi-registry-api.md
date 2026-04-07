# Spec: ModelRegistry and getApiKeyAndHeaders

## Capability 1 — ModelRegistry instantiation uses static factory

GIVEN `@mariozechner/pi-coding-agent` 0.65.2 is installed  
WHEN `PiAgentRunner._getOrCreateSession()` is called with `authMode="own"`  
THEN `ModelRegistry.create(authStorage, modelsJsonPath)` is called — not `new ModelRegistry(...)`

GIVEN `@mariozechner/pi-coding-agent` 0.65.2 is installed  
WHEN `PiAgentRunner._getOrCreateSession()` is called with `authMode="pi"`  
THEN `ModelRegistry.create(authStorage, modelsJsonPath)` is called — not `new ModelRegistry(...)`

## Capability 2 — custom-compaction uses getApiKeyAndHeaders

GIVEN the custom-compaction extension is loaded  
WHEN `session_before_compact` fires and a matching model is found  
THEN `ctx.modelRegistry.getApiKeyAndHeaders(model)` is called  
AND if `auth.ok` is false, the extension returns undefined (falls back to default compaction)  
AND if `auth.ok` is true, `complete()` is called with both `apiKey` and `headers`

## Capability 3 — build is clean

GIVEN all source changes are applied  
WHEN `npm run build` runs  
THEN `tsc` exits 0 with no errors
