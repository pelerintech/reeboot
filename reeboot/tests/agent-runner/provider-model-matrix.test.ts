import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const { buildModelFromConfig } = await import('../../src/agent-runner/pi-runner.js');

beforeEach(() => {});

describe('buildModelFromConfig provider→model matrix', () => {
  it('(a) custom/OpenAI-compatible provider carries baseUrl and preserves the id', () => {
    const { model, apiKey } = buildModelFromConfig({
      provider: 'custom',
      id: 'my-model',
      apiKey: 'ck-123',
      baseUrl: 'https://gateway.example.com/v1',
    });

    expect(model.baseUrl).toBe('https://gateway.example.com/v1');
    expect(model.provider).toBe('custom');
    expect(model.id).toBe('my-model');
    // OpenAI-compatible construction
    expect(model.api).toBe('openai-completions');
    expect(apiKey).toBe('ck-123');
  });

  it('(b) local provider with baseUrl builds a usable keyless model', () => {
    const { model, apiKey } = buildModelFromConfig({
      provider: 'ollama',
      id: 'llama3',
      apiKey: '',
      baseUrl: 'http://localhost:11434/v1',
    });

    expect(model.baseUrl).toBe('http://localhost:11434/v1');
    expect(model.provider).toBe('ollama');
    expect(model.id).toBe('llama3');
    // keyless — no apiKey required for local servers
    expect(apiKey).toBe('');
    // it is a streamable OpenAI-compatible model
    expect(model.api).toBe('openai-completions');
  });

  it('(b2) lmstudio local provider also builds keyless with baseUrl', () => {
    const { model, apiKey } = buildModelFromConfig({
      provider: 'lmstudio',
      id: 'gpt-oss',
      apiKey: '',
      baseUrl: 'http://127.0.0.1:1234/v1',
    });
    expect(model.baseUrl).toBe('http://127.0.0.1:1234/v1');
    expect(model.provider).toBe('lmstudio');
    expect(apiKey).toBe('');
  });

  it('(c) standard cloud provider resolves to the expected catalog model', () => {
    const { model, apiKey } = buildModelFromConfig({
      provider: 'anthropic',
      id: 'claude-sonnet-4-5',
      apiKey: 'sk-cloud',
    });

    expect(model.provider).toBe('anthropic');
    expect(model.id).toBe('claude-sonnet-4-5');
    expect(model.api).toBe('anthropic-messages');
    expect(apiKey).toBe('sk-cloud');
  });

  it('(c2) a configured baseUrl overrides the cloud model baseUrl (closes the gap)', () => {
    const { model } = buildModelFromConfig({
      provider: 'openai',
      id: 'gpt-4o',
      apiKey: 'sk',
      baseUrl: 'https://proxy.example.com/v1',
    });
    expect(model.id).toBe('gpt-4o');
    expect(model.baseUrl).toBe('https://proxy.example.com/v1');
  });
});
