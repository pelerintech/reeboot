import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('config preserve — providers array preserved as-is', () => {
  it('preserves providers array with baseUrl and api fields', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');

    writeFileSync(configPath, JSON.stringify({
      agent: {
        model: {
          authMode: 'own',
          providers: [
            {
              name: 'LM Studio',
              provider: 'lmstudio',
              id: 'llama3',
              apiKey: 'sk-local-proxy',
              baseUrl: 'http://localhost:1234/v1',
              api: 'openai-completions',
              default: true,
            },
            {
              name: 'Ollama',
              provider: 'ollama',
              id: 'mistral',
              apiKey: '',
              baseUrl: 'http://localhost:11434/v1',
              api: 'openai-completions',
              default: false,
            },
          ],
        },
      },
    }));

    const cfg = loadConfig(configPath);

    expect(cfg.agent.model.providers).toHaveLength(2);
    expect(cfg.agent.model.providers[0].name).toBe('LM Studio');
    expect(cfg.agent.model.providers[0].baseUrl).toBe('http://localhost:1234/v1');
    expect(cfg.agent.model.providers[0].api).toBe('openai-completions');
    expect(cfg.agent.model.providers[0].default).toBe(true);
    expect(cfg.agent.model.providers[1].name).toBe('Ollama');
    expect(cfg.agent.model.providers[1].baseUrl).toBe('http://localhost:11434/v1');
    expect(cfg.agent.model.providers[1].api).toBe('openai-completions');
    expect(cfg.agent.model.providers[1].default).toBe(false);
  });

  it('migration does not run when providers array is non-empty', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');

    // Config has both flat fields AND providers array — providers should win
    writeFileSync(configPath, JSON.stringify({
      agent: {
        model: {
          authMode: 'own',
          provider: 'anthropic',
          id: 'claude-sonnet-4-5',
          apiKey: 'sk-old',
          providers: [
            { name: 'My Ollama', provider: 'ollama', id: 'llama3', default: true },
          ],
        },
      },
    }));

    const cfg = loadConfig(configPath);

    // Should have the providers array entry, not a migrated one from flat fields
    expect(cfg.agent.model.providers).toHaveLength(1);
    expect(cfg.agent.model.providers[0].provider).toBe('ollama');
  });
});
