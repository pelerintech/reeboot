import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('wizard — provider name in models.json', () => {
  it('uses the actual provider name, not hardcoded "ollama"', async () => {
    const { writeOllamaModelsJson } = await import('@src/wizard/steps/provider.js');

    await writeOllamaModelsJson({
      configDir: tmpDir,
      provider: 'custom',
      ollamaBaseUrl: 'http://my-server:5000/v1',
      modelId: 'my-model',
      apiKey: 'sk-local-proxy',
    });

    const modelsPath = join(tmpDir, 'models.json');
    expect(existsSync(modelsPath)).toBe(true);

    const modelsContent = JSON.parse(readFileSync(modelsPath, 'utf-8'));
    expect(modelsContent.providers).toBeDefined();
    expect(modelsContent.providers.custom).toBeDefined();
    expect(modelsContent.providers.ollama).toBeUndefined();
    expect(modelsContent.providers.custom.baseUrl).toBe('http://my-server:5000/v1');
    expect(modelsContent.providers.custom.models[0].id).toBe('my-model');
  });

  it('works with ollama provider name', async () => {
    const { writeOllamaModelsJson } = await import('@src/wizard/steps/provider.js');

    await writeOllamaModelsJson({
      configDir: tmpDir,
      provider: 'ollama',
      ollamaBaseUrl: 'http://localhost:11434/v1',
      modelId: 'llama3',
      apiKey: 'sk-local-proxy',
    });

    const modelsContent = JSON.parse(readFileSync(join(tmpDir, 'models.json'), 'utf-8'));
    expect(modelsContent.providers.ollama).toBeDefined();
    expect(modelsContent.providers.ollama.baseUrl).toBe('http://localhost:11434/v1');
  });

  it('works with lmstudio provider name', async () => {
    const { writeOllamaModelsJson } = await import('@src/wizard/steps/provider.js');

    await writeOllamaModelsJson({
      configDir: tmpDir,
      provider: 'lmstudio',
      ollamaBaseUrl: 'http://localhost:1234/v1',
      modelId: 'mistral',
      apiKey: 'sk-local-proxy',
    });

    const modelsContent = JSON.parse(readFileSync(join(tmpDir, 'models.json'), 'utf-8'));
    expect(modelsContent.providers.lmstudio).toBeDefined();
    expect(modelsContent.providers.lmstudio.baseUrl).toBe('http://localhost:1234/v1');
  });
});
