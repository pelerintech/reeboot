import type { Prompter } from '../prompter.js'
import type { Config } from '../../config.js'
import { defaultConfig } from '../../config.js'
import { fb } from '../../utils/fallback.js'

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

  // ── Build config (defensively merge existing with defaults) ───────────────
  const { loadConfig } = await import('../../config.js');
  let rawExisting: unknown = null;
  try {
    rawExisting = await loadConfig(finalConfigPath);
  } catch {
    // No existing config — use defaults
  }

  // Type-guard: ensure rawExisting is a Config or null
  const existing = (rawExisting && typeof rawExisting === 'object') ? (rawExisting as Config) : null;

  const config: Config = {
    ...fb(existing, defaultConfig),
    agent: {
      ...fb(existing?.agent, defaultConfig.agent),
      name: draft.agentName,
      model: {
        authMode: draft.authMode ?? 'own',
        provider: draft.authMode === 'pi' ? '' : draft.provider,
        id: draft.authMode === 'pi' ? '' : draft.modelId,
        apiKey: draft.authMode === 'pi' ? '' : (draft.apiKey ?? ''),
      },
    },
    channels: {
      web: {
        ...fb(existing?.channels?.web, defaultConfig.channels.web),
        enabled: true,
        port: fb(existing?.channels?.web, defaultConfig.channels.web).port,
      },
      whatsapp: {
        ...fb(existing?.channels?.whatsapp, defaultConfig.channels.whatsapp),
        enabled: draft.whatsapp,
      },
      signal: {
        ...fb(existing?.channels?.signal, defaultConfig.channels.signal),
        enabled: draft.signal,
        phoneNumber: draft.signalPhone ?? fb(existing?.channels?.signal, defaultConfig.channels.signal).phoneNumber,
        apiPort: fb(existing?.channels?.signal, defaultConfig.channels.signal).apiPort,
        pollInterval: fb(existing?.channels?.signal, defaultConfig.channels.signal).pollInterval,
      },
    },
    search: {
      provider: draft.searchProvider as any,
      apiKey: draft.searchApiKey ?? fb(existing?.search, defaultConfig.search).apiKey,
      searxngBaseUrl: draft.searxngBaseUrl ?? fb(existing?.search, defaultConfig.search).searxngBaseUrl,
    },
    heartbeat: fb(existing?.heartbeat, defaultConfig.heartbeat),
    sandbox: fb(existing?.sandbox, defaultConfig.sandbox),
    logging: fb(existing?.logging, defaultConfig.logging),
    server: fb(existing?.server, defaultConfig.server),
    extensions: fb(existing?.extensions, defaultConfig.extensions),
    routing: fb(existing?.routing, defaultConfig.routing),
    session: fb(existing?.session, defaultConfig.session),
    credentialProxy: fb(existing?.credentialProxy, defaultConfig.credentialProxy),
    skills: fb(existing?.skills, defaultConfig.skills),
    mcp: fb(existing?.mcp, defaultConfig.mcp),
    permissions: fb(existing?.permissions, defaultConfig.permissions),
    security: fb(existing?.security, defaultConfig.security),
    contexts: existing?.contexts ?? defaultConfig.contexts,
    memory: fb(existing?.memory, defaultConfig.memory),
    knowledge: fb(existing?.knowledge, defaultConfig.knowledge),
    resilience: fb(existing?.resilience, defaultConfig.resilience),
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
