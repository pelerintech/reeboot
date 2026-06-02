import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-test-'));
  vi.resetModules();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('wizard — API key prompt for local providers', () => {
  it('prompts for API key when selecting a local provider', async () => {
    // Mock detectPiAuth to return unavailable so we skip the pi auth choice
    vi.doMock('@src/wizard/detect-pi-auth.js', () => ({
      detectPiAuth: vi.fn().mockResolvedValue({ available: false }),
    }));

    const { runProviderStep } = await import('@src/wizard/steps/provider.js');

    const selectCalls: string[] = [];
    const inputCalls: string[] = [];
    const passwordCalls: string[] = [];

    const fakePrompter = {
      select: vi.fn()
        .mockImplementation(async (opts) => {
          selectCalls.push(opts.message);
          if (opts.message?.includes('Select your AI provider')) return 'ollama';
          if (opts.message?.includes('Select a model')) return 'llama3';
          if (opts.message?.includes('default')) return 'yes';
          return 'ollama';
        }),
      input: vi.fn()
        .mockImplementation(async (opts) => {
          inputCalls.push(opts.message);
          if (opts.message?.includes('Base URL')) return 'http://localhost:11434/v1';
          if (opts.message?.includes('API key')) return 'sk-local-proxy';
          if (opts.message?.includes('Model ID')) return 'llama3';
          return opts.default ?? '';
        }),
      password: vi.fn()
        .mockImplementation(async (opts) => {
          passwordCalls.push(opts.message);
          return 'sk-local-proxy';
        }),
      confirm: vi.fn().mockResolvedValue(true),
      checkbox: vi.fn().mockResolvedValue([]),
    };

    await runProviderStep({
      prompter: fakePrompter as any,
      configDir: tmpDir,
      _deps: {
        fetchLocalModels: async () => ['llama3', 'mistral'],
      },
    });

    // The local provider branch should prompt for API key
    const apiKeyPrompts = passwordCalls.filter(c => c.includes('API key'))
      .concat(inputCalls.filter(c => c.includes('API key')));
    expect(apiKeyPrompts.length).toBeGreaterThanOrEqual(1);
  });

  it('stores the API key in the result for local providers', async () => {
    vi.doMock('@src/wizard/detect-pi-auth.js', () => ({
      detectPiAuth: vi.fn().mockResolvedValue({ available: false }),
    }));

    const { runProviderStep } = await import('@src/wizard/steps/provider.js');

    const fakePrompter = {
      select: vi.fn()
        .mockImplementation(async (opts) => {
          if (opts.message?.includes('Select your AI provider')) return 'llamacpp';
          if (opts.message?.includes('Select a model')) return 'mistral';
          if (opts.message?.includes('default')) return 'yes';
          return 'llamacpp';
        }),
      input: vi.fn()
        .mockImplementation(async (opts) => {
          if (opts.message?.includes('Base URL')) return 'http://localhost:8080/v1';
          if (opts.message?.includes('API key')) return 'sk-my-custom-key';
          if (opts.message?.includes('Model ID')) return 'mistral';
          return opts.default ?? '';
        }),
      password: vi.fn()
        .mockImplementation(async (opts) => {
          return 'sk-my-custom-key';
        }),
      confirm: vi.fn().mockResolvedValue(true),
      checkbox: vi.fn().mockResolvedValue([]),
    };

    const result = await runProviderStep({
      prompter: fakePrompter as any,
      configDir: tmpDir,
      _deps: {
        fetchLocalModels: async () => ['mistral'],
      },
    });

    expect(result.apiKey).toBe('sk-my-custom-key');
  });
});
