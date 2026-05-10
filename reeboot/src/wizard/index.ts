import { join } from 'path'
import { homedir } from 'os'
import type { Prompter } from './prompter.js'
import { InquirerPrompter } from './prompter.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WizardDeps {
  startAgent?: (configPath: string) => Promise<void>
}

export interface WizardOptions {
  prompter?: Prompter
  configPath?: string
  configDir?: string
  _deps?: WizardDeps
}

// ─── runSetupWizard ───────────────────────────────────────────────────────────

/**
 * Orchestrates the full setup wizard in order:
 *   1. Provider setup (provider, model, API key / Ollama URL+model)
 *   2. Agent name
 *   3. Channel linking (WhatsApp, Signal)
 *   4. Web search setup
 *   5. Launch (summary + start confirmation + atomic config write)
 *
 * Config is written ONLY at step 5. If the wizard is interrupted before that,
 * no config file is created or modified.
 *
 * Accepts an injectable `Prompter` for testing (defaults to InquirerPrompter).
 */
export async function runSetupWizard(opts: WizardOptions = {}): Promise<void> {
  const prompter = opts.prompter ?? new InquirerPrompter()
  const configPath = opts.configPath
    ?? process.env.REEBOOT_CONFIG_PATH
    ?? join(homedir(), '.reeboot', 'config.json')
  const configDir = opts.configDir ?? join(homedir(), '.reeboot')
  const deps = opts._deps ?? {}

  console.log('\n🚀 Welcome to Reeboot Setup Wizard\n')
  console.log('  We\'ll guide you through setting up your AI agent in 4 steps.\n')

  // ── Step 1: Deployment method ─────────────────────────────────────────────
  const deploymentChoice = await prompter.select({
    message: 'How do you want to run Reeboot?',
    choices: [
      { name: 'Native (daemon)  — run directly on this machine', value: 'native' },
      { name: 'Docker (full stack) — containerised with Docker Compose', value: 'docker' },
    ],
    default: 'native',
  })
  if (deploymentChoice === 'docker') {
    console.log('\n  Docker support coming soon. Continuing with native setup.\n')
  }

  // ── Step 2: Provider ──────────────────────────────────────────────────────
  const { runProviderStep } = await import('./steps/provider.js')
  const providerResult = await runProviderStep({ prompter, configDir })

  // ── Step 2: Agent name ────────────────────────────────────────────────────
  const { runNameStep } = await import('./steps/name.js')
  const agentName = await runNameStep({ prompter })

  // ── Step 3: Channels ──────────────────────────────────────────────────────
  const { runChannelsStep } = await import('./steps/channels.js')
  const channelsResult = await runChannelsStep({ prompter, configDir })

  // ── Step 3b: Web search ───────────────────────────────────────────────────
  const { runWebSearchStep } = await import('./steps/web-search.js')
  const searchResult = await runWebSearchStep({ prompter })

  // ── Step 4: Launch (writes config here) ──────────────────────────────────
  const { runLaunchStep } = await import('./steps/launch.js')
  await runLaunchStep({
    prompter,
    configPath,
    draft: {
      authMode: providerResult.authMode ?? 'own',
      provider: providerResult.provider,
      modelId: providerResult.modelId,
      apiKey: providerResult.apiKey,
      ollamaBaseUrl: providerResult.ollamaBaseUrl,
      agentName,
      whatsapp: channelsResult.whatsapp,
      signal: channelsResult.signal,
      signalPhone: channelsResult.signalPhone,
      searchProvider: searchResult.provider,
      searchApiKey: searchResult.apiKey,
      searxngBaseUrl: searchResult.searxngBaseUrl,
    },
  })

  // ── Scaffold directories and templates ────────────────────────────────────
  const { runWizard } = await import('../setup-wizard.js')
  // Scaffold only (non-interactive, using existing configDir)
  // We call scaffoldOnly to avoid double-writing config
  await scaffoldSetup(configDir, agentName)

  // ── Start now? ─────────────────────────────────────────────────────────────
  const startNow = await prompter.confirm({
    message: 'Start the agent now?',
    default: true,
  })
  if (startNow) {
    if (deps.startAgent) {
      await deps.startAgent(configPath)
    } else {
      const { loadConfig } = await import('../config.js')
      const { startServer } = await import('../server.js')
      const loaded = loadConfig(configPath)
      await startServer({
        port: loaded.channels.web.port,
        host: process.env.REEBOOT_HOST ?? '127.0.0.1',
        logLevel: loaded.logging.level,
        token: loaded.server.token,
        config: loaded,
      })
    }
  } else {
    console.log("\n  Run 'reeboot start' when you're ready.\n")
  }
}

// ─── scaffoldSetup ────────────────────────────────────────────────────────────

async function scaffoldSetup(configDir: string, agentName?: string): Promise<void> {
  const { mkdirSync, existsSync, copyFileSync, readFileSync, writeFileSync } = await import('fs')
  const { join } = await import('path')
  const { dirname } = await import('path')
  const { fileURLToPath } = await import('url')

  const dirs = [
    join(configDir, 'contexts', 'global'),
    join(configDir, 'contexts', 'main', 'workspace'),
    join(configDir, 'contexts', 'main', '.pi', 'extensions'),
    join(configDir, 'contexts', 'main', '.pi', 'skills'),
    join(configDir, 'channels'),
    join(configDir, 'sessions', 'main'),
  ]

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true })
  }

  // Copy templates
  // __dirname is not available in ESM directly, use fileURLToPath
  const thisDir = dirname(fileURLToPath(import.meta.url))
  const templatesDir = join(thisDir, '..', '..', 'templates')

  const copies: Array<{ src: string; dest: string }> = [
    {
      src: join(templatesDir, 'global-agents.md'),
      dest: join(configDir, 'contexts', 'global', 'AGENTS.md'),
    },
    {
      src: join(templatesDir, 'main-agents.md'),
      dest: join(configDir, 'contexts', 'main', 'AGENTS.md'),
    },
  ]

  for (const { src, dest } of copies) {
    if (!existsSync(src)) continue
    if (src.endsWith('main-agents.md') && agentName) {
      // Substitute {{AGENT_NAME}} and always overwrite (name may change on re-run)
      let tmpl = readFileSync(src, 'utf-8')
      tmpl = tmpl.replace(/\{\{AGENT_NAME\}\}/g, agentName)
      writeFileSync(dest, tmpl, 'utf-8')
    } else {
      if (!existsSync(dest)) copyFileSync(src, dest)
    }
  }
}
