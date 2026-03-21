import type { Prompter } from '../prompter.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebSearchStepResult {
  provider: string
  apiKey: string
  searxngBaseUrl: string
}

// ─── Provider env var hints ───────────────────────────────────────────────────

const SEARCH_ENV_VARS: Record<string, string> = {
  brave: 'BRAVE_API_KEY',
  tavily: 'TAVILY_API_KEY',
  serper: 'SERPER_API_KEY',
  exa: 'EXA_API_KEY',
}

// ─── runWebSearchStep ─────────────────────────────────────────────────────────

export async function runWebSearchStep(opts: {
  prompter: Prompter
}): Promise<WebSearchStepResult> {
  const { prompter } = opts

  console.log('\n── Step 3b: Web Search ──────────────────────────────────────────\n')

  const provider = await prompter.select({
    message: 'Select a web search provider:',
    choices: [
      { name: 'DuckDuckGo (free, no API key) [recommended]', value: 'duckduckgo' },
      { name: 'Brave Search (API key required)', value: 'brave' },
      { name: 'Tavily (API key required)', value: 'tavily' },
      { name: 'Serper (API key required)', value: 'serper' },
      { name: 'Exa (API key required)', value: 'exa' },
      { name: 'SearXNG (self-hosted, requires Docker)', value: 'searxng' },
      { name: 'None (fetch URLs directly, no web search)', value: 'none' },
    ],
    default: 'duckduckgo',
  })

  if (provider === 'duckduckgo') {
    console.log('  ✓ Web search enabled via DuckDuckGo — no setup required.\n')
    return { provider: 'duckduckgo', apiKey: '', searxngBaseUrl: '' }
  }

  if (provider === 'none') {
    console.log('  ℹ Agent can still fetch URLs directly. Add search later with `reeboot search setup`.\n')
    return { provider: 'none', apiKey: '', searxngBaseUrl: '' }
  }

  if (provider === 'searxng') {
    return await runSearXNGSubflow(prompter)
  }

  // API-key providers: Brave, Tavily, Serper, Exa
  const envVar = SEARCH_ENV_VARS[provider] ?? 'API_KEY'
  console.log(`  ℹ You can also set ${envVar} env var instead of storing the key.\n`)

  const apiKey = await prompter.password({
    message: `Enter your ${provider} API key:`,
    validate: (val) => val.trim().length > 0 ? true : 'API key cannot be empty',
  })

  return { provider, apiKey, searxngBaseUrl: '' }
}

// ─── SearXNG sub-flow ─────────────────────────────────────────────────────────

const SEARXNG_PORT = 8888
const SEARXNG_DEFAULT_URL = `http://localhost:${SEARXNG_PORT}`

async function runSearXNGSubflow(prompter: Prompter): Promise<WebSearchStepResult> {
  const { checkDockerStatus } = await import('../../utils/docker.js')
  const dockerStatus = await checkDockerStatus()

  if (dockerStatus === 'not-installed') {
    console.log('  ✗ Docker is not installed — SearXNG requires Docker.')
    console.log('  → Install Docker from https://www.docker.com/products/docker-desktop')
    console.log('  ℹ Using DuckDuckGo as fallback. Run `reeboot search setup searxng` later.\n')
    return { provider: 'duckduckgo', apiKey: '', searxngBaseUrl: '' }
  }

  if (dockerStatus === 'not-running') {
    console.log('  ✗ Docker is not running — SearXNG requires Docker.')
    console.log('  ℹ Using DuckDuckGo as fallback. Run `reeboot search setup searxng` later.\n')
    return { provider: 'duckduckgo', apiKey: '', searxngBaseUrl: '' }
  }

  // Probe for an already-running SearXNG instance
  const { probeSearXNG } = await import('../probe-searxng.js')
  const detected = await probeSearXNG()

  // Ask user to confirm or edit the URL
  const urlMessage = detected
    ? '  SearXNG URL (confirm or edit):'
    : '  SearXNG URL:'
  const defaultUrl = detected ?? SEARXNG_DEFAULT_URL

  const searxngUrl = await prompter.input({
    message: urlMessage,
    default: defaultUrl,
    validate: (val) => val.trim().length > 0 ? true : 'URL cannot be empty',
  })

  // Ask whether to use URL directly or start a new container
  const action = await prompter.select({
    message: '  What would you like to do?',
    choices: [
      { name: 'Use this URL directly', value: 'use-url' },
      { name: `Start new reeboot-searxng container on port ${SEARXNG_PORT}`, value: 'start-new' },
    ],
    default: 'use-url',
  })

  if (action === 'use-url') {
    console.log(`  ✓ Using SearXNG at ${searxngUrl}\n`)
    return { provider: 'searxng', apiKey: '', searxngBaseUrl: searxngUrl }
  }

  // Start new container
  console.log('  Starting reeboot-searxng container...')

  const { spawnSync } = await import('child_process')

  // Remove any existing container
  spawnSync('docker', ['rm', '-f', 'reeboot-searxng'], { stdio: 'pipe' })

  const start = spawnSync('docker', [
    'run', '-d',
    '--name', 'reeboot-searxng',
    '-p', `${SEARXNG_PORT}:8080`,
    '--restart', 'always',
    'searxng/searxng:latest',
  ], { stdio: 'pipe' })

  if (start.status !== 0) {
    console.log('  ✗ SearXNG failed to start — using DuckDuckGo instead.\n')
    return { provider: 'duckduckgo', apiKey: '', searxngBaseUrl: '' }
  }

  console.log(`  ✓ SearXNG running at ${SEARXNG_DEFAULT_URL}\n`)
  return { provider: 'searxng', apiKey: '', searxngBaseUrl: SEARXNG_DEFAULT_URL }
}
