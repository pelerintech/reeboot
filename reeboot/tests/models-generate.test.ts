import { describe, it, expect } from 'vitest';
import type { Config } from '@src/config.js';

describe('generateModelsJson — authMode: "own"', () => {
  it('returns a JSON string with provider entry for authMode: "own"', async () => {
    const { generateModelsJson } = await import('@src/models.js');

    const config = {
      agent: {
        model: {
          authMode: 'own' as const,
          provider: '',
          id: '',
          apiKey: '',
          baseUrl: '',
          api: 'openai-completions',
          providers: [
            {
              name: 'My Ollama',
              provider: 'ollama',
              id: 'llama3',
              apiKey: 'sk-test-key',
              baseUrl: 'http://localhost:11434/v1',
              api: 'openai-completions',
              default: true,
            },
          ],
        },
      },
    } as unknown as Config;

    const result = generateModelsJson(config);

    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');

    const parsed = JSON.parse(result!);
    expect(parsed.providers).toBeDefined();
    expect(parsed.providers.ollama).toBeDefined();
    expect(parsed.providers.ollama.baseUrl).toBe('http://localhost:11434/v1');
    expect(parsed.providers.ollama.api).toBe('openai-completions');
    expect(parsed.providers.ollama.apiKey).toBe('sk-test-key');
    expect(parsed.providers.ollama.models).toHaveLength(1);
    expect(parsed.providers.ollama.models[0].id).toBe('llama3');
  });

  it('selects the provider marked default: true', async () => {
    const { generateModelsJson } = await import('@src/models.js');

    const config = {
      agent: {
        model: {
          authMode: 'own' as const,
          provider: '',
          id: '',
          apiKey: '',
          baseUrl: '',
          api: 'openai-completions',
          providers: [
            {
              name: 'Ollama',
              provider: 'ollama',
              id: 'mistral',
              apiKey: 'sk-1',
              baseUrl: 'http://localhost:11434/v1',
              api: 'openai-completions',
              default: false,
            },
            {
              name: 'LM Studio',
              provider: 'lmstudio',
              id: 'llama3',
              apiKey: 'sk-2',
              baseUrl: 'http://localhost:1234/v1',
              api: 'openai-completions',
              default: true,
            },
          ],
        },
      },
    } as unknown as Config;

    const result = generateModelsJson(config);
    const parsed = JSON.parse(result!);

    // Should have lmstudio, not ollama
    expect(parsed.providers.lmstudio).toBeDefined();
    expect(parsed.providers.ollama).toBeUndefined();
    expect(parsed.providers.lmstudio.models[0].id).toBe('llama3');
  });

  it('returns null for empty providers array', async () => {
    const { generateModelsJson } = await import('@src/models.js');

    const config = {
      agent: {
        model: {
          authMode: 'own' as const,
          provider: '',
          id: '',
          apiKey: '',
          baseUrl: '',
          api: 'openai-completions',
          providers: [],
        },
      },
    } as unknown as Config;

    const result = generateModelsJson(config);
    expect(result).toBeNull();
  });

  it('returns null for authMode: "pi"', async () => {
    const { generateModelsJson } = await import('@src/models.js');

    const config = {
      agent: {
        model: {
          authMode: 'pi' as const,
          provider: 'anthropic',
          id: 'claude-sonnet-4-5',
          apiKey: 'sk-test',
          baseUrl: '',
          api: 'openai-completions',
          providers: [
            {
              name: 'Anthropic',
              provider: 'anthropic',
              id: 'claude-sonnet-4-5',
              apiKey: 'sk-test',
              baseUrl: '',
              api: 'openai-completions',
              default: true,
            },
          ],
        },
      },
    } as unknown as Config;

    const result = generateModelsJson(config);
    expect(result).toBeNull();
  });

  it('uses the first provider when none is marked default', async () => {
    const { generateModelsJson } = await import('@src/models.js');

    const config = {
      agent: {
        model: {
          authMode: 'own' as const,
          provider: '',
          id: '',
          apiKey: '',
          baseUrl: '',
          api: 'openai-completions',
          providers: [
            {
              name: 'Ollama',
              provider: 'ollama',
              id: 'llama3',
              apiKey: 'sk-1',
              baseUrl: 'http://localhost:11434/v1',
              api: 'openai-completions',
              default: false,
            },
            {
              name: 'LM Studio',
              provider: 'lmstudio',
              id: 'mistral',
              apiKey: 'sk-2',
              baseUrl: 'http://localhost:1234/v1',
              api: 'openai-completions',
              default: false,
            },
          ],
        },
      },
    } as unknown as Config;

    const result = generateModelsJson(config);
    const parsed = JSON.parse(result!);

    // Should use first provider (ollama)
    expect(parsed.providers.ollama).toBeDefined();
    expect(parsed.providers.ollama.models[0].id).toBe('llama3');
  });
});
