/**
 * One-shot LLM call utility.
 *
 * Builds a non-streaming completion call from config and resolves the active model.
 * Returns the assistant message text.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Config = any;

export type LlmCall = (prompt: string) => Promise<string>;

/**
 * Create a one-shot LLM call function from config.
 *
 * Resolves the active model from config (provider/id/apiKey/baseURL, openai-compatible)
 * and performs a single non-streaming POST to the chat completions endpoint.
 *
 * @param config - The full app config (config.agent.model is read)
 * @param fetchImpl - Optional fetch implementation (defaults to global fetch)
 * @returns An async function that takes a prompt string and returns the assistant text
 */
export function createLlmCall(
  config: Config,
  fetchImpl: typeof fetch = fetch
): LlmCall {
  const model = config?.agent?.model;
  if (!model) {
    throw new Error('createLlmCall: no agent.model in config');
  }

  // Resolve the active provider
  let provider: string;
  let id: string;
  let apiKey: string;
  let baseUrl: string;
  let api: string;

  if (model.authMode === 'own' && model.providers?.length > 0) {
    const active = model.providers.find((p: any) => p.default) ?? model.providers[0];
    provider = active.provider || 'unknown';
    id = active.id || 'unknown';
    apiKey = active.apiKey || '';
    baseUrl = active.baseUrl || 'http://localhost:11434/v1';
    api = active.api || 'openai-chat-completions';
  } else {
    provider = model.provider || 'unknown';
    id = model.id || 'unknown';
    apiKey = model.apiKey || '';
    baseUrl = model.baseUrl || 'http://localhost:11434/v1';
    api = model.api || 'openai-chat-completions';
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  return async (prompt: string): Promise<string> => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: id,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error');
      throw new Error(`LLM call failed (${response.status}): ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    return text;
  };
}
