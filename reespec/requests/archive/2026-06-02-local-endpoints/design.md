# Design — Local Endpoints

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    authMode: "own" flow                          │
│                                                                  │
│  User edits config.json                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ agent: {                                                │    │
│  │   model: {                                              │    │
│  │     authMode: "own",                                    │    │
│  │     providers: [                                        │    │
│  │       { name: "OpenRouter", provider: "openrouter",      │    │
│  │         id: "kimi2.6", apiKey: "...", default: true },  │    │
│  │       { name: "LM Studio", provider: "lmstudio",         │    │
│  │         id: "llama3", apiKey: "sk-local-proxy",          │    │
│  │         baseUrl: "http://localhost:1234/v1",             │    │
│  │         api: "openai-completions" }                      │    │
│  │     ]                                                   │    │
│  │   }                                                     │    │
│  │ }                                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  server.ts startup                                           │    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. Read config.json                                     │    │
│  │ 2. Pick default provider (or first)                     │    │
│  │ 3. Write ~/.reeboot/agent/models.json                   │    │
│  │    { "providers": { "lmstudio": {                       │    │
│  │        "baseUrl": "...", "api": "openai-completions",    │    │
│  │        "apiKey": "sk-local-proxy",                       │    │
│  │        "models": [{ "id": "llama3", "contextWindow": 8192 }] │
│  │      } } }                                              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  pi-runner creates ModelRegistry                               │
│  reads ~/.reeboot/agent/models.json                             │
│  finds model → works                                           │
└──────────────────────────────────────────────────────────────────┘
```

## Schema Changes

### config.ts — ModelConfigSchema

Add a `providers` array alongside the existing flat fields. The flat fields (`provider`, `id`, `apiKey`) are retained for backward compatibility and auto-migrated to the array on first config load.

```ts
const ProviderEntrySchema = z.object({
  name: z.string().default(''),
  provider: z.string().default(''),
  id: z.string().default(''),
  apiKey: z.string().default(''),
  baseUrl: z.string().default(''),
  api: z.string().default('openai-completions'),
  default: z.boolean().default(false),
});

const ModelConfigSchema = z.object({
  authMode: z.enum(['pi', 'own']).default('own'),
  provider: z.string().default(''),      // legacy, migrated
  id: z.string().default(''),             // legacy, migrated
  apiKey: z.string().default(''),         // legacy, migrated
  providers: z.array(ProviderEntrySchema).default([]),
});
```

### Migration logic

On `loadConfig()`, if `providers` is empty but `provider` is non-empty, auto-migrate:

```ts
if (result.agent.model.providers.length === 0 && result.agent.model.provider) {
  result.agent.model.providers = [{
    name: result.agent.model.provider,
    provider: result.agent.model.provider,
    id: result.agent.model.id,
    apiKey: result.agent.model.apiKey,
    api: 'openai-completions',
    default: true,
  }];
}
```

## Startup Generation

### models.ts (new module)

A new module `reeboot/src/models.ts` that:
- Reads config.json
- Selects the active provider (default=true, or first)
- Generates `~/.reeboot/agent/models.json`
- Called from `server.ts` after config is loaded, before channel init

```ts
export function generateModelsJson(config: Config): string | null {
  if (config.agent.model.authMode !== 'own') return null;
  
  const providers = config.agent.model.providers;
  if (providers.length === 0) return null;
  
  const active = providers.find(p => p.default) ?? providers[0];
  
  // Build models.json entry for this provider
  const modelEntry: Record<string, any> = {
    id: active.id,
    name: active.name || active.id,
    contextWindow: 128000,  // sensible default
    maxTokens: 16384,       // sensible default
  };
  
  const providerEntry: Record<string, any> = {
    baseUrl: active.baseUrl || `http://localhost:11434/v1`,
    api: active.api || 'openai-completions',
    apiKey: active.apiKey || 'sk-local-proxy',
    models: [modelEntry],
  };
  
  // For known local providers, use sensible defaults
  if (!active.baseUrl) {
    const defaults: Record<string, string> = {
      ollama: 'http://localhost:11434/v1',
      llamacpp: 'http://localhost:8080/v1',
      lmstudio: 'http://localhost:1234/v1',
    };
    providerEntry.baseUrl = defaults[active.provider] || 'http://localhost:11434/v1';
  }
  
  return JSON.stringify({ providers: { [active.provider]: providerEntry } }, null, 2);
}
```

### server.ts integration

Call `generateModelsJson()` after config is loaded and before the orchestrator starts:

```ts
// In server.ts, after config loading:
const modelsJson = generateModelsJson(config);
if (modelsJson) {
  const modelsPath = join(homedir(), '.reeboot', 'agent', 'models.json');
  writeFileSync(modelsPath, modelsJson, 'utf-8');
}
```

## Wizard Changes

### provider.ts — API key prompt for local providers

Local providers (ollama, llamacpp, lmstudio, custom) currently skip the API key step. Update to prompt for it, pre-filled with `sk-local-proxy`.

### provider.ts — Prepend mode

Instead of writing models.json and overwriting config, the wizard now:
1. Reads existing config.json
2. Prepends a new provider entry to the `providers` array (so it becomes first)
3. Asks if this should be the default
4. Writes the updated config.json
5. Writes models.json for the new provider

**Why prepend?** When no provider is marked `default: true`, the first one in the list is used at startup. By prepending, the most recently configured provider becomes the active one by default — the latest setup is the one that runs unless the user explicitly marks a different one as default.

### provider.ts — Fix provider name

`writeOllamaModelsJson` currently hardcodes `"ollama"` as the provider key. Fix to use the actual selected provider name.

### provider.ts — Include api field

The models.json template must include `"api": "openai-completions"` so pi knows which stream handler to use.

## Env Vars

Add four new env vars used by `resolveProviderEnvKey()` in pi-runner.ts:

| Env Var | Provider |
|---|---|
| `OLLAMA_API_KEY` | ollama |
| `LLAMACPP_API_KEY` | llamacpp |
| `LM_STUDIO_API_KEY` | lmstudio |
| `CUSTOM_API_KEY` | custom |

## Documentation

### docs/configuration/reference.md

Add `baseUrl`, `api`, and `providers` to the `agent.model` section. Document the migration from flat fields to array.

### README.md

Add a local endpoint configuration example showing a complete config.json with a local provider.

### CHANGELOG.md

Create with a new version entry documenting:
- New `baseUrl` and `api` fields in config.json
- Multi-provider support via `providers` array
- Startup models.json generation
- Fixed wizard for local providers
- New env vars for local provider keys
