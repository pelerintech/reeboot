import type { Prompter } from '../prompter.js'
import type { Config } from '../../config.js'
import { defaultConfig } from '../../config.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LaunchDraft {
  authMode?: 'pi' | 'own'
  provider: string
  modelId: string
  apiKey: string
  ollamaBaseUrl?: string
  agentName: string
  whatsapp: boolean
  signal: boolean
  signalPhone?: string
  searchProvider: string
  searchApiKey?: string
  searxngBaseUrl?: string
}

// ─── runLaunchStep ────────────────────────────────────────────────────────────

export async function runLaunchStep(opts: {
  prompter: Prompter
  draft: LaunchDraft
  configPath?: string
}): Promise<void> {
  const { prompter, draft, configPath } = opts
  const { join } = await import('path')
  const { homedir } = await import('os')

  const finalConfigPath = configPath ?? join(homedir(), '.reeboot', 'config.json')

  // ── Summary display ──────────────────────────────────────────────────────
  console.log('\n── Step 4: Ready to Launch ──────────────────────────────────────\n')
  console.log('  Configuration summary:')
  console.log('  ─────────────────────────────────────────────────────────────')
  console.log(`  Provider:     ${draft.provider}`)
  console.log(`  Model:        ${draft.modelId}`)
  console.log(`  Agent name:   ${draft.agentName}`)
  console.log(`  WhatsApp:     ${draft.whatsapp ? '✓ linked' : '✗ not linked'}`)
  console.log(`  Signal:       ${draft.signal ? '✓ linked' : '✗ not linked'}`)
  console.log(`  Web search:   ${draft.searchProvider}`)
  console.log('  ─────────────────────────────────────────────────────────────\n')

  // ── Build config ─────────────────────────────────────────────────────────
  const config: Config = {
    ...defaultConfig,
    agent: {
      ...defaultConfig.agent,
      name: draft.agentName,
      model: {
        authMode: draft.authMode ?? 'own',
        provider: draft.authMode === 'pi' ? '' : draft.provider,
        id: draft.authMode === 'pi' ? '' : draft.modelId,
        apiKey: draft.authMode === 'pi' ? '' : (draft.apiKey ?? ''),
      },
    },
    channels: {
      web: { ...defaultConfig.channels.web, enabled: true, port: defaultConfig.channels.web.port },
      whatsapp: { ...defaultConfig.channels.whatsapp, enabled: draft.whatsapp },
      signal: {
        ...defaultConfig.channels.signal,
        enabled: draft.signal,
        phoneNumber: draft.signalPhone ?? '',
        apiPort: defaultConfig.channels.signal.apiPort,
        pollInterval: defaultConfig.channels.signal.pollInterval,
      },
    },
    search: {
      provider: draft.searchProvider as any,
      apiKey: draft.searchApiKey ?? '',
      searxngBaseUrl: draft.searxngBaseUrl ?? 'http://localhost:8888',
    },
    heartbeat: defaultConfig.heartbeat,
    sandbox: defaultConfig.sandbox,
    logging: defaultConfig.logging,
    server: defaultConfig.server,
    extensions: defaultConfig.extensions,
    routing: defaultConfig.routing,
    session: defaultConfig.session,
    credentialProxy: defaultConfig.credentialProxy,
  }

  // ── Ask to start now ──────────────────────────────────────────────────────
  const startNow = await prompter.confirm({
    message: 'Start your agent now?',
    default: true,
  })

  // Write config atomically (always, whether starting now or not)
  const { saveConfigAtomic } = await import('../../utils/atomic-config.js')
  saveConfigAtomic(config as any, finalConfigPath)
  console.log(`\n  ✓ Config written to ${finalConfigPath}`)

  if (startNow) {
    console.log('\n  🚀 Starting reeboot...\n')
    const { loadConfig } = await import('../../config.js')
    const { startServer } = await import('../../server.js')
    const loaded = loadConfig(finalConfigPath)
    console.log(`  ✓ WebChat ready at http://localhost:${loaded.channels.web.port}`)
    await startServer({
      port: loaded.channels.web.port,
      host: process.env.REEBOOT_HOST ?? '127.0.0.1',
      logLevel: loaded.logging.level,
      token: loaded.server.token,
      config: loaded,
    })
  } else {
    console.log('\n  Run `reeboot start` when ready.\n')
  }
}
