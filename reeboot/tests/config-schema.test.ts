import { describe, it, expect } from 'vitest';

describe('ModelConfigSchema — providers array', () => {
  it('default config has providers array on agent.model', async () => {
    const { defaultConfig } = await import('@src/config.js');
    expect(Array.isArray((defaultConfig.agent.model as any).providers)).toBe(true);
    expect((defaultConfig.agent.model as any).providers).toEqual([]);
  });

  it('ConfigSchema parses providers array with all fields', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({
      agent: {
        model: {
          authMode: 'own',
          providers: [
            {
              name: 'My Ollama',
              provider: 'ollama',
              id: 'llama3',
              apiKey: 'sk-local-proxy',
              baseUrl: 'http://localhost:11434/v1',
              api: 'openai-completions',
              default: true,
            },
          ],
        },
      },
    });
    expect(cfg.agent.model.providers).toHaveLength(1);
    expect(cfg.agent.model.providers[0].name).toBe('My Ollama');
    expect(cfg.agent.model.providers[0].provider).toBe('ollama');
    expect(cfg.agent.model.providers[0].default).toBe(true);
  });
});

describe('ModelConfigSchema — baseUrl and api fields', () => {
  it('default config has baseUrl and api fields on agent.model', async () => {
    const { defaultConfig } = await import('@src/config.js');
    expect(defaultConfig.agent.model).toHaveProperty('baseUrl');
    expect(defaultConfig.agent.model).toHaveProperty('api');
    expect((defaultConfig.agent.model as any).baseUrl).toBe('');
    expect((defaultConfig.agent.model as any).api).toBe('openai-completions');
  });

  it('ConfigSchema parses baseUrl and api from config', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({
      agent: {
        model: {
          authMode: 'own',
          provider: 'ollama',
          id: 'llama3',
          apiKey: 'sk-test',
          baseUrl: 'http://localhost:11434/v1',
          api: 'openai-completions',
        },
      },
    });
    expect(cfg.agent.model.baseUrl).toBe('http://localhost:11434/v1');
    expect(cfg.agent.model.api).toBe('openai-completions');
  });
});

describe('ModelConfigSchema — no default marked', () => {
  it('preserves all provider entries when none has default: true', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({
      agent: {
        model: {
          authMode: 'own',
          providers: [
            {
              name: 'Ollama',
              provider: 'ollama',
              id: 'llama3',
              apiKey: 'sk-local-proxy',
              baseUrl: 'http://localhost:11434/v1',
              api: 'openai-completions',
              default: false,
            },
            {
              name: 'LM Studio',
              provider: 'lmstudio',
              id: 'mistral',
              apiKey: 'sk-local-proxy',
              baseUrl: 'http://localhost:1234/v1',
              api: 'openai-completions',
              default: false,
            },
          ],
        },
      },
    });
    expect(cfg.agent.model.providers).toHaveLength(2);
    expect(cfg.agent.model.providers[0].provider).toBe('ollama');
    expect(cfg.agent.model.providers[1].provider).toBe('lmstudio');
    expect(cfg.agent.model.providers[0].default).toBe(false);
    expect(cfg.agent.model.providers[1].default).toBe(false);
  });
});

describe('ModelConfigSchema — entry with no apiKey field', () => {
  it('preserves provider entry missing apiKey with empty string default', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({
      agent: {
        model: {
          authMode: 'own',
          providers: [
            {
              name: 'Ollama',
              provider: 'ollama',
              id: 'llama3',
              baseUrl: 'http://localhost:11434/v1',
              api: 'openai-completions',
              default: true,
            },
          ],
        },
      },
    });
    expect(cfg.agent.model.providers).toHaveLength(1);
    expect(cfg.agent.model.providers[0].apiKey).toBe('');
  });
});
