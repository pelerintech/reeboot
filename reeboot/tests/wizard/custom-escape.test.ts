import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@src/wizard/detect-pi-auth.js', () => ({
  detectPiAuth: vi.fn().mockResolvedValue({ available: false }),
}))

function makePrompter(answers: any[]) {
  let i = 0
  return {
    select: vi.fn(async (opts: any) => {
      const ans = answers[i++]
      // Validate the answer is in choices (like FakePrompter does)
      const valid = opts.choices?.some((c: any) => c.value === ans)
      if (!valid) throw new Error(`custom-escape test: value "${ans}" not in choices: ${JSON.stringify(opts.choices?.map((c: any) => c.value))}`)
      return ans
    }),
    input: vi.fn(async () => answers[i++]),
    password: vi.fn(async () => answers[i++]),
    confirm: vi.fn(async () => answers[i++]),
    checkbox: vi.fn(async () => answers[i++]),
  }
}

describe('__custom__ escape hatch on provider select', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('__custom__ is in provider choices, and selecting it prompts for manual value', async () => {
    const { runProviderStep } = await import('@src/wizard/steps/provider.js')
    // Select __custom__ for provider, then type a custom provider name,
    // then apikey, then model ID (input since custom provider has no model list)
    const prompter = makePrompter(['__custom__', 'myco', 'sk-myco-key', 'myco/model-1'])
    const result = await runProviderStep({
      prompter: prompter as any,
      configDir: '/tmp',
      _deps: { fetchLocalModels: async () => { throw new Error('no') }, fetchCloudModels: async () => { throw new Error('no') } },
    })
    expect(result.provider).toBe('myco')
  })

  it('__custom__ is in model choices for cloud providers', async () => {
    const { runProviderStep } = await import('@src/wizard/steps/provider.js')
    // provider → apikey → __custom__ model → manual model input
    const prompter = makePrompter(['anthropic', 'sk-test', '__custom__', 'my-custom-model'])
    const result = await runProviderStep({
      prompter: prompter as any,
      configDir: '/tmp',
      _deps: { fetchCloudModels: async () => { throw new Error('no') } },
    })
    expect(result.modelId).toBe('my-custom-model')
  })
})
