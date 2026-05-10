import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Prompter } from '../prompter.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProviderStepResult {
  authMode: 'pi' | 'own'
  provider: string
  modelId: string
  apiKey: string
  ollamaBaseUrl: string
}

export interface ProviderChoice {
  name: string
  value: string
}

export interface ModelChoice {
  name: string
  value: string
}

// ─── Provider list (private-first) ──────────────────────────────────────────────

// Separator sentinel for the local/cloud visual divider
export const PROVIDER_SEPARATOR = { type: 'separator' as const, value: '__separator__', name: '────────────────────────────────────────' }

export const PROVIDERS: (ProviderChoice | typeof PROVIDER_SEPARATOR)[] = [
  // Local (private-first) ─────────────────────────────────────────────────────
  { name: 'Ollama (local)            — http://localhost:11434/v1', value: 'ollama' },
  { name: 'llama.cpp (local)         — http://localhost:8080/v1',  value: 'llamacpp' },
  { name: 'LM Studio (local)         — http://localhost:1234/v1',  value: 'lmstudio' },
  { name: 'Custom OpenAI-compatible endpoint (local)',              value: 'custom' },
  // divider
  PROVIDER_SEPARATOR,
  // Cloud ──────────────────────────────────────────────────────────────────────
  { name: 'Anthropic (Claude)', value: 'anthropic' },
  { name: 'OpenAI (GPT)', value: 'openai' },
  { name: 'Google (Gemini)', value: 'google' },
  { name: 'Groq (fast inference)', value: 'groq' },
  { name: 'Mistral', value: 'mistral' },
  { name: 'xAI (Grok)', value: 'xai' },
  { name: 'OpenRouter (multi-provider)', value: 'openrouter' },
]

// ─── Curated model lists per provider ────────────────────────────────────────

export const MODEL_LISTS: Record<string, ModelChoice[]> = {
  anthropic: [
    { name: 'claude-sonnet-4-5 [recommended]', value: 'claude-sonnet-4-5' },
    { name: 'claude-3-5-haiku-20241022', value: 'claude-3-5-haiku-20241022' },
    { name: 'claude-opus-4-5', value: 'claude-opus-4-5' },
  ],
  openai: [
    { name: 'gpt-4o [recommended]', value: 'gpt-4o' },
    { name: 'gpt-4o-mini', value: 'gpt-4o-mini' },
    { name: 'o3-mini', value: 'o3-mini' },
  ],
  google: [
    { name: 'gemini-2.0-flash [recommended]', value: 'gemini-2.0-flash' },
    { name: 'gemini-2.0-flash-lite', value: 'gemini-2.0-flash-lite' },
    { name: 'gemini-2.5-pro-preview', value: 'gemini-2.5-pro-preview' },
  ],
  groq: [
    { name: 'llama-3.3-70b-versatile [recommended]', value: 'llama-3.3-70b-versatile' },
    { name: 'llama-3.1-8b-instant', value: 'llama-3.1-8b-instant' },
    { name: 'mixtral-8x7b-32768', value: 'mixtral-8x7b-32768' },
  ],
  mistral: [
    { name: 'mistral-large-latest [recommended]', value: 'mistral-large-latest' },
    { name: 'mistral-small-latest', value: 'mistral-small-latest' },
    { name: 'codestral-latest', value: 'codestral-latest' },
  ],
  xai: [
    { name: 'grok-2 [recommended]', value: 'grok-2' },
    { name: 'grok-2-mini', value: 'grok-2-mini' },
  ],
  openrouter: [
    { name: 'openai/gpt-4o [recommended]', value: 'openai/gpt-4o' },
    { name: 'anthropic/claude-sonnet-4-5', value: 'anthropic/claude-sonnet-4-5' },
    { name: 'google/gemini-2.0-flash', value: 'google/gemini-2.0-flash' },
  ],
}

// ─── ENV var hints per provider ───────────────────────────────────────────────

const ENV_VARS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  xai: 'XAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
}

// ─── runProviderStep ──────────────────────────────────────────────────────────

export interface ProviderStepDeps {
  fetchLocalModels?: (baseUrl: string) => Promise<string[]>
  fetchCloudModels?: (provider: string, apiKey: string) => Promise<string[]>
}

export async function runProviderStep(opts: {
  prompter: Prompter
  configDir: string
  _deps?: ProviderStepDeps
}): Promise<ProviderStepResult> {
  const { prompter, configDir } = opts
  const deps = opts._deps ?? {}

  console.log('\n── Step 1: AI Provider ──────────────────────────────────────────\n')

  // Check if pi is installed and authenticated
  const { detectPiAuth } = await import('../detect-pi-auth.js')
  const piAuth = await detectPiAuth()

  if (piAuth.available) {
    console.log(`  Pi is installed and authenticated (${piAuth.provider} / ${piAuth.model}).\n`)
    const choice = await prompter.select({
      message: 'How would you like to configure the AI provider?',
      choices: [
        { name: `Use pi's auth (${piAuth.provider} / ${piAuth.model})`, value: 'pi' },
        { name: 'Set up separate credentials for reeboot', value: 'own' },
      ],
      default: 'pi',
    })

    if (choice === 'pi') {
      return { authMode: 'pi', provider: '', modelId: '', apiKey: '', ollamaBaseUrl: '' }
    }

    console.log('  Setting up separate credentials. You will need an API key.\n')
  } else {
    console.log('  No pi installation found. You will need an API key for one of the supported providers.\n')
  }

  console.log('  Note: Custom providers can be added via config.json after setup.\n')

  // Build provider choices including the visual separator for terminal rendering
  const providerChoicesWithCustom = [
    ...PROVIDERS,
    { name: 'Enter custom value...', value: '__custom__' },
  ]
  let provider = await prompter.select({
    message: 'Select your AI provider:',
    choices: providerChoicesWithCustom,
  })
  if (provider === '__custom__') {
    provider = await prompter.input({
      message: 'Enter custom provider ID:',
      validate: (val) => val.trim().length > 0 ? true : 'provider cannot be empty',
    })
  }

  let modelId: string
  let apiKey = ''
  let ollamaBaseUrl = ''

  const LOCAL_PROVIDERS: Record<string, string> = {
    ollama:   'http://localhost:11434/v1',
    llamacpp: 'http://localhost:8080/v1',
    lmstudio: 'http://localhost:1234/v1',
    custom:   '',
  }

  if (provider in LOCAL_PROVIDERS) {
    // Local provider: URL + model ID (no API key)
    const defaultUrl = LOCAL_PROVIDERS[provider]
    ollamaBaseUrl = await prompter.input({
      message: `Base URL for ${provider}:`,
      default: defaultUrl || undefined,
      validate: (val) => val.trim().length > 0 ? true : 'base URL cannot be empty',
    })

    // Try to auto-detect models from running server
    let detectedModels: string[] = []
    try {
      detectedModels = await (deps.fetchLocalModels ?? defaultFetchLocalModels)(ollamaBaseUrl)
    } catch {
      // Server not reachable — fall through to manual input
    }

    if (detectedModels.length > 0) {
      const modelChoices = [
        ...detectedModels.map(m => ({ name: m, value: m })),
        { name: 'Enter custom value...', value: '__custom__' },
      ]
      modelId = await prompter.select({
        message: 'Select a model:',
        choices: modelChoices,
        default: detectedModels[0],
      })
      if (modelId === '__custom__') {
        modelId = await prompter.input({
          message: 'Enter custom model ID:',
          validate: (val) => val.trim().length > 0 ? true : 'model ID cannot be empty',
        })
      }
    } else {
      if (detectedModels.length === 0) {
        console.log('  ⚠  Server not reachable or no models found. Enter model ID manually.\n')
      }
      modelId = await prompter.input({
        message: 'Model ID:',
        validate: (val) => val.trim().length > 0 ? true : 'model ID cannot be empty',
      })
    }

    // Write models.json
    await writeOllamaModelsJson({ configDir, ollamaBaseUrl, modelId })
  } else {
    // Cloud provider: API key first, then model (enables live model fetch)
    // Exception: OpenRouter has a public models endpoint — fetch before API key

    let openRouterPreFetchedModels: string[] = []
    if (provider === 'openrouter') {
      try {
        openRouterPreFetchedModels = await (deps.fetchCloudModels ?? defaultFetchCloudModels)(provider, '')
      } catch {
        // fall through to static list
      }
    }

    // Prompt for API key
    const envVar = ENV_VARS[provider] ?? 'API_KEY'
    const envKeySet = !!process.env[envVar]

    if (envKeySet) {
      console.log(`  ✓  ${envVar} is set in your environment — no need to enter a key.\n`)
    } else {
      console.log(`  ℹ  You can also set ${envVar} env var instead of storing the key.\n`)

      // Loop until a non-empty key is provided
      while (!apiKey.trim()) {
        apiKey = await prompter.password({
          message: `Enter your ${provider} API key (required):`,
          validate: (val) => val.trim().length > 0 ? true : 'API key cannot be empty',
        })
        if (!apiKey.trim()) {
          console.log('  ⚠  API key cannot be empty. Press Ctrl+C to cancel setup.')
        }
      }
    }

    // Select model — try live fetch first (use pre-fetched for OpenRouter), fall back to static list
    let liveModels: string[] = openRouterPreFetchedModels
    if (liveModels.length === 0) {
      try {
        liveModels = await (deps.fetchCloudModels ?? defaultFetchCloudModels)(provider, apiKey)
      } catch {
        // fetch failed — use static fallback
      }
    }

    if (liveModels.length > 0) {
      const modelChoices = [
        ...liveModels.map(m => ({ name: m, value: m })),
        { name: 'Enter custom value...', value: '__custom__' },
      ]
      modelId = await prompter.select({
        message: 'Select a model:',
        choices: modelChoices,
        default: liveModels[0],
      })
      if (modelId === '__custom__') {
        modelId = await prompter.input({
          message: 'Enter custom model ID:',
          validate: (val) => val.trim().length > 0 ? true : 'model ID cannot be empty',
        })
      }
    } else {
      const staticChoices = MODEL_LISTS[provider] ?? []
      // Always show warning when live fetch was attempted but yielded no models
      console.log('  ⚠  Could not fetch live models. Using curated list.\n')
      if (staticChoices.length > 0) {
        const staticWithCustom = [
          ...staticChoices,
          { name: 'Enter custom value...', value: '__custom__' },
        ]
        modelId = await prompter.select({
          message: 'Select a model:',
          choices: staticWithCustom,
          default: staticChoices[0].value,
        })
        if (modelId === '__custom__') {
          modelId = await prompter.input({
            message: 'Enter custom model ID:',
            validate: (val) => val.trim().length > 0 ? true : 'model ID cannot be empty',
          })
        }
      } else {
        modelId = await prompter.input({
          message: 'Model ID:',
          validate: (val) => val.trim().length > 0 ? true : 'model ID cannot be empty',
        })
      }
    }
  }

  return { authMode: 'own', provider, modelId, apiKey, ollamaBaseUrl }
}

// ─── writeOllamaModelsJson ────────────────────────────────────────────────────

async function writeOllamaModelsJson(opts: {
  configDir: string
  ollamaBaseUrl: string
  modelId: string
}): Promise<void> {
  const { configDir, ollamaBaseUrl, modelId } = opts
  const templatesDir = join(__dirname, '..', '..', '..', 'templates')
  const templatePath = join(templatesDir, 'models-ollama.json')

  let template: string
  if (existsSync(templatePath)) {
    template = readFileSync(templatePath, 'utf-8')
    template = template
      .replace(/{{MODEL_ID}}/g, modelId)
      .replace(/"baseUrl":\s*"[^"]*"/, `"baseUrl": "${ollamaBaseUrl}"`)
  } else {
    // Fallback inline template
    template = JSON.stringify({
      providers: [{
        id: 'ollama',
        name: 'Ollama (local)',
        baseUrl: ollamaBaseUrl,
        models: [{ id: modelId, name: modelId, contextWindow: 8192 }],
      }],
    }, null, 2)
  }

  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, 'models.json'), template, 'utf-8')
}

// ─── defaultFetchLocalModels ──────────────────────────────────────────────────

async function defaultFetchLocalModels(baseUrl: string): Promise<string[]> {
  // For Ollama, use /api/tags; for others use /models (OpenAI-compatible)
  const isOllama = baseUrl.includes(':11434')
  const url = isOllama
    ? baseUrl.replace(/\/v1\/?$/, '') + '/api/tags'
    : baseUrl.replace(/\/?$/, '') + '/models'

  const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json() as any

  if (isOllama && data.models) {
    return (data.models as any[]).map((m: any) => m.name as string)
  }
  if (data.data) {
    return (data.data as any[]).map((m: any) => m.id as string)
  }
  return []
}

// ─── defaultFetchCloudModels ──────────────────────────────────────────────────

const CLOUD_MODEL_ENDPOINTS: Record<string, string> = {
  anthropic:   'https://api.anthropic.com/v1/models',
  openai:      'https://api.openai.com/v1/models',
  google:      'https://generativelanguage.googleapis.com/v1beta/models',
  groq:        'https://api.groq.com/openai/v1/models',
  mistral:     'https://api.mistral.ai/v1/models',
  xai:         'https://api.x.ai/v1/models',
  openrouter:  'https://openrouter.ai/api/v1/models',
}

async function defaultFetchCloudModels(provider: string, apiKey: string): Promise<string[]> {
  const endpoint = CLOUD_MODEL_ENDPOINTS[provider]
  if (!endpoint) return []

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) {
    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`
    }
  }

  const res = await fetch(endpoint, {
    headers,
    signal: AbortSignal.timeout(3000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json() as any

  const items: any[] = data.data ?? data.models ?? []
  return items.map((m: any) => m.id ?? m.name ?? '').filter(Boolean)
}
