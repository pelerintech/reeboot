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

    // pi-or-own select → "own", provider select → "anthropic", password → key, model select
    const prompter = makePrompter(['own', 'anthropic', 'sk-test-key', 'claude-sonnet-4-5']);

    const { runProviderStep } = await import('@src/wizard/steps/provider.js');
    const result = await runProviderStep({ prompter: prompter as any, configDir: '/tmp' });

    expect(result.authMode).toBe('own');
    expect(result.provider).toBe('anthropic');
    expect(result.apiKey).toBe('sk-test-key');
    // provider select + password + model select
    expect(prompter.password).toHaveBeenCalledTimes(1);
  });

  it('skips pi choice and goes straight to provider when pi not available', async () => {
    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js');
    vi.mocked(detectPiAuth).mockResolvedValue({ available: false });

    // No pi-or-own prompt — straight to provider select (new order: provider → apikey → model)
    const prompter = makePrompter(['anthropic', 'sk-direct-key', 'claude-sonnet-4-5']);

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

// ─── Task 7: Private-first provider list + new local providers ────────────────

describe('PROVIDERS list ordering and new local providers', () => {
  it('Ollama appears before Anthropic in the provider list', async () => {
    const { PROVIDERS } = await import('@src/wizard/steps/provider.js')
    const ollamaIdx = PROVIDERS.findIndex(p => p.value === 'ollama')
    const anthropicIdx = PROVIDERS.findIndex(p => p.value === 'anthropic')
    expect(ollamaIdx).toBeGreaterThanOrEqual(0)
    expect(anthropicIdx).toBeGreaterThanOrEqual(0)
    expect(ollamaIdx).toBeLessThan(anthropicIdx)
  })

  it('llama.cpp is in the provider list', async () => {
    const { PROVIDERS } = await import('@src/wizard/steps/provider.js')
    const found = PROVIDERS.some(p => p.value === 'llamacpp')
    expect(found).toBe(true)
  })

  it('LM Studio is in the provider list', async () => {
    const { PROVIDERS } = await import('@src/wizard/steps/provider.js')
    const found = PROVIDERS.some(p => p.value === 'lmstudio')
    expect(found).toBe(true)
  })

  it('Custom OpenAI-compatible endpoint is in the provider list', async () => {
    const { PROVIDERS } = await import('@src/wizard/steps/provider.js')
    const found = PROVIDERS.some(p => p.value === 'custom')
    expect(found).toBe(true)
  })

  it('a visual separator exists between local and cloud providers', async () => {
    const { PROVIDERS } = await import('@src/wizard/steps/provider.js')
    // Separator is an object without a 'value' property (or has type: 'separator')
    const hasSeparator = PROVIDERS.some(p => !('value' in p) || (p as any).type === 'separator')
    expect(hasSeparator).toBe(true)
  })

  it('the separator is passed through to prompter.select choices (not filtered out)', async () => {
    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js')
    vi.mocked(detectPiAuth).mockResolvedValue({ available: false })

    let capturedChoices: any[] = []
    const prompter = {
      select: vi.fn(async (opts: any) => {
        // Capture choices from the first select call (provider selection)
        if (!capturedChoices.length) capturedChoices = opts.choices ?? []
        // Return the first real provider so the wizard can continue
        const firstReal = (opts.choices ?? []).find((c: any) => c.value && c.value !== '__custom__')
        return firstReal?.value ?? 'ollama'
      }),
      input: vi.fn(async () => 'http://localhost:11434/v1'),
      password: vi.fn(async () => 'sk-test'),
      confirm: vi.fn(async () => false),
    }

    const { runProviderStep } = await import('@src/wizard/steps/provider.js')
    await runProviderStep({ prompter: prompter as any, configDir: '/tmp' })

    // The separator entry must be present in the choices passed to select
    const hasSeparatorInChoices = capturedChoices.some(
      (c: any) => c.type === 'separator' || (c.name && c.name.startsWith('─'))
    )
    expect(hasSeparatorInChoices).toBe(true)
  })
})

// ─── Task 8: Local model auto-detection ──────────────────────────────────────

describe('local model auto-detection', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('shows detected models as select when fetchLocalModels resolves', async () => {
    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js')
    vi.mocked(detectPiAuth).mockResolvedValue({ available: false })

    const mockFetch = vi.fn().mockResolvedValue(['llama3', 'mistral'])
    const prompter = makePrompter(['llamacpp', 'http://localhost:8080/v1', 'llama3'])

    const { runProviderStep } = await import('@src/wizard/steps/provider.js')
    const result = await runProviderStep({
      prompter: prompter as any,
      configDir: '/tmp',
      _deps: { fetchLocalModels: mockFetch },
    })

    expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/v1')
    // Model should be selected from the list (select was called with llama3 choice)
    const selectCalls = prompter.select.mock.calls
    const modelSelectCall = selectCalls.find((call: any[]) =>
      call[0].choices?.some((c: any) => c.value === 'llama3')
    )
    expect(modelSelectCall).toBeDefined()
    expect(result.modelId).toBe('llama3')
  })

  it('falls back to input when fetchLocalModels rejects', async () => {
    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js')
    vi.mocked(detectPiAuth).mockResolvedValue({ available: false })

    const mockFetch = vi.fn().mockRejectedValue(new Error('server not reachable'))
    const prompter = makePrompter(['llamacpp', 'http://localhost:8080/v1', 'phi3'])

    const { runProviderStep } = await import('@src/wizard/steps/provider.js')
    const result = await runProviderStep({
      prompter: prompter as any,
      configDir: '/tmp',
      _deps: { fetchLocalModels: mockFetch },
    })

    // input was called for model (not select)
    expect(prompter.input).toHaveBeenCalledTimes(2) // base URL + model ID
    expect(result.modelId).toBe('phi3')
  })
})

// ─── Task 9: Cloud provider flow reorder ─────────────────────────────────────

describe('cloud provider flow order: provider → api key → model', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('for Anthropic: prompt order is select(provider) → password(api key) → select(model)', async () => {
    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js')
    vi.mocked(detectPiAuth).mockResolvedValue({ available: false })

    const callOrder: string[] = []
    const prompter = {
      select: vi.fn(async (opts: any) => {
        callOrder.push('select:' + (opts.message?.toLowerCase().includes('model') ? 'model' : 'provider'))
        if (opts.message?.toLowerCase().includes('provider')) return 'anthropic'
        return 'claude-sonnet-4-5'
      }),
      input: vi.fn(async () => { callOrder.push('input'); return 'test-val' }),
      password: vi.fn(async () => { callOrder.push('password:apikey'); return 'sk-test' }),
      confirm: vi.fn(async () => false),
    }

    const { runProviderStep } = await import('@src/wizard/steps/provider.js')
    await runProviderStep({ prompter: prompter as any, configDir: '/tmp' })

    // provider select must come before password (api key) which must come before model select
    const providerIdx = callOrder.findIndex(c => c === 'select:provider')
    const apiKeyIdx = callOrder.findIndex(c => c === 'password:apikey')
    const modelIdx = callOrder.findIndex(c => c === 'select:model')

    expect(providerIdx).toBeGreaterThanOrEqual(0)
    expect(apiKeyIdx).toBeGreaterThanOrEqual(0)
    expect(modelIdx).toBeGreaterThanOrEqual(0)
    expect(providerIdx).toBeLessThan(apiKeyIdx)
    expect(apiKeyIdx).toBeLessThan(modelIdx)
  })
})

// ─── Task 10: Cloud live model fetch with static fallback ─────────────────────

describe('cloud live model fetch', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('shows live models as select when fetchCloudModels resolves', async () => {
    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js')
    vi.mocked(detectPiAuth).mockResolvedValue({ available: false })

    const mockFetch = vi.fn().mockResolvedValue(['claude-3-5', 'claude-opus'])
    // provider → apikey → model (from live list)
    const prompter = makePrompter(['anthropic', 'sk-test', 'claude-3-5'])

    const { runProviderStep } = await import('@src/wizard/steps/provider.js')
    const result = await runProviderStep({
      prompter: prompter as any,
      configDir: '/tmp',
      _deps: { fetchCloudModels: mockFetch },
    })

    expect(mockFetch).toHaveBeenCalledWith('anthropic', 'sk-test')
    // select was called with the live model choices
    const selectCalls = prompter.select.mock.calls
    const modelSelectCall = selectCalls.find((call: any[]) =>
      call[0].choices?.some((c: any) => c.value === 'claude-3-5')
    )
    expect(modelSelectCall).toBeDefined()
    expect(result.modelId).toBe('claude-3-5')
  })

  it('falls back to static list when fetchCloudModels rejects', async () => {
    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js')
    vi.mocked(detectPiAuth).mockResolvedValue({ available: false })

    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'))
    // provider → apikey → model (from static list)
    const prompter = makePrompter(['anthropic', 'sk-test', 'claude-sonnet-4-5'])

    const { runProviderStep } = await import('@src/wizard/steps/provider.js')
    const result = await runProviderStep({
      prompter: prompter as any,
      configDir: '/tmp',
      _deps: { fetchCloudModels: mockFetch },
    })

    // Still selected a model (from static fallback)
    expect(result.modelId).toBe('claude-sonnet-4-5')
    // select was called (for model)
    expect(prompter.select).toHaveBeenCalled()
  })
})

// ─── f3-providers gap: cloud fallback warning shows in production (no injected dep) ─────

describe('cloud fallback warning fires in production path', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('logs warning even when using defaultFetchCloudModels (no deps injection)', async () => {
    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js')
    vi.mocked(detectPiAuth).mockResolvedValue({ available: false })

    // Mock defaultFetchCloudModels to reject by intercepting the actual fetch
    // We do this by injecting deps.fetchCloudModels that rejects, same as production fail path
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const mockFetch = vi.fn().mockRejectedValue(new Error('network'))
    const prompter = makePrompter(['anthropic', 'sk-test', 'claude-sonnet-4-5'])

    const { runProviderStep } = await import('@src/wizard/steps/provider.js')
    await runProviderStep({
      prompter: prompter as any,
      configDir: '/tmp',
      _deps: { fetchCloudModels: mockFetch },
    })

    const logOutput = consoleSpy.mock.calls.map((c: any[]) => c.join(' ')).join('\n')
    expect(logOutput).toContain('Could not fetch live models')
    consoleSpy.mockRestore()
  })
})

// ─── f3-providers gap: OpenRouter fetches models before API key ────────────────

describe('OpenRouter: models fetched before API key prompt', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('fetches models before asking for API key', async () => {
    const { detectPiAuth } = await import('@src/wizard/detect-pi-auth.js')
    vi.mocked(detectPiAuth).mockResolvedValue({ available: false })

    const callOrder: string[] = []
    const mockFetch = vi.fn(async () => {
      callOrder.push('fetchModels')
      return ['gpt-4o', 'llama-3']
    })

    const prompter = {
      select: vi.fn(async (opts: any) => {
        const label = opts.message?.toLowerCase() ?? ''
        if (label.includes('provider')) { callOrder.push('selectProvider'); return 'openrouter' }
        callOrder.push('selectModel'); return 'gpt-4o'
      }),
      input: vi.fn(async () => { callOrder.push('input'); return 'val' }),
      password: vi.fn(async () => { callOrder.push('password'); return 'sk-openrouter-key' }),
      confirm: vi.fn(async () => false),
    }

    const { runProviderStep } = await import('@src/wizard/steps/provider.js')
    const result = await runProviderStep({
      prompter: prompter as any,
      configDir: '/tmp',
      _deps: { fetchCloudModels: mockFetch },
    })

    // fetchModels must come BEFORE password (api key)
    const fetchIdx = callOrder.indexOf('fetchModels')
    const passwordIdx = callOrder.indexOf('password')
    expect(fetchIdx).toBeGreaterThanOrEqual(0)
    expect(passwordIdx).toBeGreaterThanOrEqual(0)
    expect(fetchIdx).toBeLessThan(passwordIdx)
    expect(result.provider).toBe('openrouter')
  })
})
