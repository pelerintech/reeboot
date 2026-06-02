import { describe, it, expect } from 'vitest';
import type { Config } from '@src/config.js';

describe('generateModelsJson — sensible defaults', () => {
  it('applies default baseUrl for ollama when missing', async () => {
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
    const parsed = JSON.parse(result!);
    expect(parsed.providers.ollama.baseUrl).toBe('http://localhost:11434/v1');
  });

  it('applies default baseUrl for llamacpp when missing', async () => {
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
              name: 'llama.cpp',
              provider: 'llamacpp',
              id: 'mistral',
              apiKey: '',
              baseUrl: '',
              api: 'openai-completions',
              default: true,
            },
          ],
        },
      },
    } as unknown as Config;

    const result = generateModelsJson(config);
    const parsed = JSON.parse(result!);
    expect(parsed.providers.llamacpp.baseUrl).toBe('http://localhost:8080/v1');
  });

  it('applies default baseUrl for lmstudio when missing', async () => {
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
              name: 'LM Studio',
              provider: 'lmstudio',
              id: 'llama3',
              apiKey: '',
              baseUrl: '',
              api: 'openai-completions',
              default: true,
            },
          ],
        },
      },
    } as unknown as Config;

    const result = generateModelsJson(config);
    const parsed = JSON.parse(result!);
    expect(parsed.providers.lmstudio.baseUrl).toBe('http://localhost:1234/v1');
  });

  it('applies default baseUrl for unknown provider', async () => {
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
              name: 'Custom',
              provider: 'custom',
              id: 'my-model',
              apiKey: '',
              baseUrl: '',
              api: 'openai-completions',
              default: true,
            },
          ],
        },
      },
    } as unknown as Config;

    const result = generateModelsJson(config);
    const parsed = JSON.parse(result!);
    expect(parsed.providers.custom.baseUrl).toBe('http://localhost:11434/v1');
  });

  it('uses default apiKey "sk-local-proxy" when missing', async () => {
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
              apiKey: '',
              baseUrl: 'http://localhost:11434/v1',
              api: 'openai-completions',
              default: true,
            },
          ],
        },
      },
    } as unknown as Config;

    const result = generateModelsJson(config);
    const parsed = JSON.parse(result!);
    expect(parsed.providers.ollama.apiKey).toBe('sk-local-proxy');
  });

  it('preserves explicit apiKey when provided', async () => {
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
              apiKey: 'sk-my-custom-key',
              baseUrl: 'http://localhost:11434/v1',
              api: 'openai-completions',
              default: true,
            },
          ],
        },
      },
    } as unknown as Config;

    const result = generateModelsJson(config);
    const parsed = JSON.parse(result!);
    expect(parsed.providers.ollama.apiKey).toBe('sk-my-custom-key');
  });
});
