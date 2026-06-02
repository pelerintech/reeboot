import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('wizard — api field in models.json', () => {
  it('includes "api": "openai-completions" in the provider entry', async () => {
    const { writeOllamaModelsJson } = await import('@src/wizard/steps/provider.js');

    await writeOllamaModelsJson({
      configDir: tmpDir,
      provider: 'ollama',
      ollamaBaseUrl: 'http://localhost:11434/v1',
      modelId: 'llama3',
      apiKey: 'sk-local-proxy',
    });

    const modelsContent = JSON.parse(readFileSync(join(tmpDir, 'models.json'), 'utf-8'));
    expect(modelsContent.providers.ollama.api).toBe('openai-completions');
  });

  it('includes api field for custom provider', async () => {
    const { writeOllamaModelsJson } = await import('@src/wizard/steps/provider.js');

    await writeOllamaModelsJson({
      configDir: tmpDir,
      provider: 'custom',
      ollamaBaseUrl: 'http://my-server:5000/v1',
      modelId: 'my-model',
      apiKey: 'sk-test',
    });

    const modelsContent = JSON.parse(readFileSync(join(tmpDir, 'models.json'), 'utf-8'));
    expect(modelsContent.providers.custom.api).toBe('openai-completions');
  });
});
