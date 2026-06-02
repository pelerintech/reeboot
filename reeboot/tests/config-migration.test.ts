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

describe('config migration — flat fields to providers array', () => {
  it('migrates flat provider/id/apiKey to providers array on loadConfig', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');

    // Write a legacy config with flat fields (no providers array)
    writeFileSync(configPath, JSON.stringify({
      agent: {
        model: {
          authMode: 'own',
          provider: 'anthropic',
          id: 'claude-sonnet-4-5',
          apiKey: 'sk-legacy-key',
        },
      },
    }));

    const cfg = loadConfig(configPath);

    // The providers array should be populated from the flat fields
    expect(cfg.agent.model.providers).toHaveLength(1);
    expect(cfg.agent.model.providers[0].name).toBe('anthropic');
    expect(cfg.agent.model.providers[0].provider).toBe('anthropic');
    expect(cfg.agent.model.providers[0].id).toBe('claude-sonnet-4-5');
    expect(cfg.agent.model.providers[0].apiKey).toBe('sk-legacy-key');
    expect(cfg.agent.model.providers[0].default).toBe(true);
    expect(cfg.agent.model.providers[0].api).toBe('openai-completions');
  });

  it('does not migrate when providers array is already populated', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');

    writeFileSync(configPath, JSON.stringify({
      agent: {
        model: {
          authMode: 'own',
          provider: 'anthropic',
          providers: [
            { name: 'My Provider', provider: 'ollama', id: 'llama3', default: true },
          ],
        },
      },
    }));

    const cfg = loadConfig(configPath);

    // The existing providers array should be preserved
    expect(cfg.agent.model.providers).toHaveLength(1);
    expect(cfg.agent.model.providers[0].name).toBe('My Provider');
    expect(cfg.agent.model.providers[0].provider).toBe('ollama');
  });

  it('does not migrate when both provider and providers are empty', async () => {
    const { loadConfig } = await import('@src/config.js');
    const configPath = join(tmpDir, 'config.json');

    writeFileSync(configPath, JSON.stringify({
      agent: {
        model: {
          authMode: 'own',
        },
      },
    }));

    const cfg = loadConfig(configPath);

    expect(cfg.agent.model.providers).toEqual([]);
  });
});
