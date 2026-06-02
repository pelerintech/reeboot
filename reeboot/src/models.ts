import type { Config } from './config.js';

// Sensible default base URLs for known local providers
const DEFAULT_BASE_URLS: Record<string, string> = {
  ollama:   'http://localhost:11434/v1',
  llamacpp: 'http://localhost:8080/v1',
  lmstudio: 'http://localhost:1234/v1',
};

/**
 * Generate models.json content for authMode: "own".
 *
 * Reads the config, selects the active provider (default=true or first),
 * applies sensible defaults for missing baseUrl/apiKey, and returns
 * a JSON string suitable for writing to ~/.reeboot/agent/models.json.
 *
 * Returns null when authMode is not "own" or no providers are configured.
 */
export function generateModelsJson(config: Config): string | null {
  const model = config.agent.model;

  // Only generate for authMode: "own"
  if (model.authMode !== 'own') {
    return null;
  }

  const providers = model.providers;
  if (providers.length === 0) {
    return null;
  }

  // Select active provider: default=true, or first in list
  const active = providers.find((p) => p.default) ?? providers[0];

  // Apply sensible defaults for missing baseUrl
  let baseUrl = active.baseUrl;
  if (!baseUrl) {
    baseUrl = DEFAULT_BASE_URLS[active.provider] ?? 'http://localhost:11434/v1';
  }

  // Apply default apiKey when missing
  const apiKey = active.apiKey || 'sk-local-proxy';

  // Use the configured api or default to openai-completions
  const api = active.api || 'openai-completions';

  // Build the model entry
  const modelEntry = {
    id: active.id,
    name: active.name || active.id,
    contextWindow: 128000,
    maxTokens: 16384,
  };

  // Build the provider entry
  const providerEntry = {
    baseUrl,
    api,
    apiKey,
    models: [modelEntry],
  };

  return JSON.stringify(
    { providers: { [active.provider]: providerEntry } },
    null,
    2
  );
}
