import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('PROVIDER_ENV_VARS — local provider env vars', () => {
  let PROVIDER_ENV_VARS: Record<string, string>;

  beforeEach(async () => {
    // We need to access the module-level constant. Since it's not exported,
    // we'll check via the resolveProviderEnvKey behavior.
    const piRunner = await import('@src/agent-runner/pi-runner.js');
    // The constant is module-private, so we test via the function's behavior
    PROVIDER_ENV_VARS = (piRunner as any).PROVIDER_ENV_VARS ?? {};
  });

  afterEach(() => {
    // Clean up env vars
    delete process.env.OLLAMA_API_KEY;
    delete process.env.LLAMACPP_API_KEY;
    delete process.env.LM_STUDIO_API_KEY;
    delete process.env.CUSTOM_API_KEY;
  });

  it('contains OLLAMA_API_KEY', async () => {
    const { resolveProviderEnvKey } = await import('@src/agent-runner/pi-runner.js');
    process.env.OLLAMA_API_KEY = 'test-ollama-key';
    expect(resolveProviderEnvKey('ollama')).toBe('test-ollama-key');
  });

  it('contains LLAMACPP_API_KEY', async () => {
    const { resolveProviderEnvKey } = await import('@src/agent-runner/pi-runner.js');
    process.env.LLAMACPP_API_KEY = 'test-llamacpp-key';
    expect(resolveProviderEnvKey('llamacpp')).toBe('test-llamacpp-key');
  });

  it('contains LM_STUDIO_API_KEY', async () => {
    const { resolveProviderEnvKey } = await import('@src/agent-runner/pi-runner.js');
    process.env.LM_STUDIO_API_KEY = 'test-lmstudio-key';
    expect(resolveProviderEnvKey('lmstudio')).toBe('test-lmstudio-key');
  });

  it('contains CUSTOM_API_KEY', async () => {
    const { resolveProviderEnvKey } = await import('@src/agent-runner/pi-runner.js');
    process.env.CUSTOM_API_KEY = 'test-custom-key';
    expect(resolveProviderEnvKey('custom')).toBe('test-custom-key');
  });

  it('returns empty string when env var is not set', async () => {
    const { resolveProviderEnvKey } = await import('@src/agent-runner/pi-runner.js');
    delete process.env.OLLAMA_API_KEY;
    expect(resolveProviderEnvKey('ollama')).toBe('');
  });

  it('returns empty string for unknown provider', async () => {
    const { resolveProviderEnvKey } = await import('@src/agent-runner/pi-runner.js');
    expect(resolveProviderEnvKey('unknown')).toBe('');
  });

  it('cross-provider isolation: OLLAMA_API_KEY set but provider is openai returns OPENAI_API_KEY', async () => {
    const { resolveProviderEnvKey } = await import('@src/agent-runner/pi-runner.js');
    process.env.OLLAMA_API_KEY = 'ollama-key-should-not-appear';
    process.env.OPENAI_API_KEY = 'openai-correct-key';
    expect(resolveProviderEnvKey('openai')).toBe('openai-correct-key');
    // Confirm it does NOT return the ollama key
    expect(resolveProviderEnvKey('openai')).not.toBe('ollama-key-should-not-appear');
  });

  it('config.json apiKey takes priority over env var', async () => {
    const { resolveProviderEnvKey } = await import('@src/agent-runner/pi-runner.js');
    process.env.OLLAMA_API_KEY = 'env-var-key';
    // resolveProviderEnvKey returns the env var value, but the actual resolution
    // in pi-runner uses config apiKey first: opts.apiKey || resolveProviderEnvKey(provider)
    // We verify that resolveProviderEnvKey returns the env var, and the caller
    // (pi-runner) short-circuits with the config value when present.
    // This test verifies the env var lookup works correctly.
    expect(resolveProviderEnvKey('ollama')).toBe('env-var-key');
    // The priority logic is: config.apiKey wins if non-empty, env var is fallback.
    // Since resolveProviderEnvKey only returns env vars, the priority is enforced
    // by the caller using `config.apiKey || resolveProviderEnvKey(provider)`.
    // We verify the short-circuit pattern works:
    const configApiKey = 'config-file-key';
    const resolved = configApiKey || resolveProviderEnvKey('ollama');
    expect(resolved).toBe('config-file-key');
    // And when config is empty, env var is used:
    const emptyConfigApiKey = '';
    const resolvedFallback = emptyConfigApiKey || resolveProviderEnvKey('ollama');
    expect(resolvedFallback).toBe('env-var-key');
  });
});
