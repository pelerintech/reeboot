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

// ─── Provider list (8) ────────────────────────────────────────────────────────

export const PROVIDERS: ProviderChoice[] = [
  { name: 'Anthropic (Claude)', value: 'anthropic' },
  { name: 'OpenAI (GPT)', value: 'openai' },
  { name: 'Google (Gemini)', value: 'google' },
  { name: 'Groq (fast inference)', value: 'groq' },
  { name: 'Mistral', value: 'mistral' },
  { name: 'xAI (Grok)', value: 'xai' },
  { name: 'OpenRouter (multi-provider)', value: 'openrouter' },
  { name: 'Ollama (local models)', value: 'ollama' },
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

export async function runProviderStep(opts: {
  prompter: Prompter
  configDir: string
}): Promise<ProviderStepResult> {
  const { prompter, configDir } = opts

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

  // Select provider
  const provider = await prompter.select({
    message: 'Select your AI provider:',
    choices: PROVIDERS,
  })

  let modelId: string
  let apiKey = ''
  let ollamaBaseUrl = ''

  if (provider === 'ollama') {
    // Ollama: URL + model ID (no API key)
    ollamaBaseUrl = await prompter.input({
      message: 'Ollama base URL:',
      default: 'http://localhost:11434/v1',
      validate: (val) => val.trim().length > 0 ? true : 'base URL cannot be empty',
    })

    modelId = await prompter.input({
      message: 'Model ID (run `ollama list` to see available models):',
      validate: (val) => val.trim().length > 0 ? true : 'model ID cannot be empty',
    })

    // Write models.json
    await writeOllamaModelsJson({ configDir, ollamaBaseUrl, modelId })
  } else {
    // Non-Ollama: select from curated model list
    const modelChoices = MODEL_LISTS[provider]
    modelId = await prompter.select({
      message: 'Select a model:',
      choices: modelChoices,
      default: modelChoices[0].value,
    })

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
