import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@src/wizard/detect-pi-auth.js', () => ({
  detectPiAuth: vi.fn(),
}));

function makePrompter(answers: any[]) {
  let i = 0;
  return {
    select: vi.fn(async () => answers[i++]),
    input: vi.fn(async () => answers[i++]),
    password: vi.fn(async () => answers[i++]),
    confirm: vi.fn(async () => answers[i++]),
  };
}

describe('runProviderStep — pi auth detection', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns authMode="pi" when pi auth available and user selects pi', async () => {
    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js');
    vi.mocked(detectPiAuth).mockResolvedValue({
      available: true,
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
    });

    // Only one prompt: the pi-or-own select → user picks "pi"
    const prompter = makePrompter(['pi']);

    const { runProviderStep } = await import('@src/wizard/steps/provider.js');
    const result = await runProviderStep({ prompter: prompter as any, configDir: '/tmp' });

    expect(result.authMode).toBe('pi');
    expect(result.provider).toBe('');
    expect(result.modelId).toBe('');
    expect(result.apiKey).toBe('');
    // No provider/model/key prompts shown
    expect(prompter.select).toHaveBeenCalledTimes(1);
    expect(prompter.password).not.toHaveBeenCalled();
  });

  it('runs existing flow with authMode="own" when user selects separate credentials', async () => {
    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js');
    vi.mocked(detectPiAuth).mockResolvedValue({
      available: true,
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
    });

    // pi-or-own select → "own", provider select → "anthropic", model select → first, password → key
    const prompter = makePrompter(['own', 'anthropic', 'claude-sonnet-4-5', 'sk-test-key']);

    const { runProviderStep } = await import('@src/wizard/steps/provider.js');
    const result = await runProviderStep({ prompter: prompter as any, configDir: '/tmp' });

    expect(result.authMode).toBe('own');
    expect(result.provider).toBe('anthropic');
    expect(result.apiKey).toBe('sk-test-key');
    // provider + model selects + password shown
    expect(prompter.password).toHaveBeenCalledTimes(1);
  });

  it('skips pi choice and goes straight to provider when pi not available', async () => {
    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js');
    vi.mocked(detectPiAuth).mockResolvedValue({ available: false });

    // No pi-or-own prompt — straight to provider select
    const prompter = makePrompter(['anthropic', 'claude-sonnet-4-5', 'sk-direct-key']);

    const { runProviderStep } = await import('@src/wizard/steps/provider.js');
    const result = await runProviderStep({ prompter: prompter as any, configDir: '/tmp' });

    expect(result.authMode).toBe('own');
    expect(result.provider).toBe('anthropic');
    // First select was the provider select (not a pi-or-own select)
    expect(prompter.select.mock.calls[0][0]).toMatchObject({
      message: expect.stringContaining('provider'),
    });
  });
});
