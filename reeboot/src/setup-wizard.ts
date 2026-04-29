import { mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { saveConfig, loadConfig, defaultConfig, type Config } from './config.js';
import { fb } from './utils/fallback.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WizardOptions {
  interactive?: boolean;
  authMode?: 'pi' | 'own';
  provider?: string;
  apiKey?: string;
  model?: string;
  channels?: string;
  name?: string;
  /** Override config directory (default: ~/.reeboot) */
  configDir?: string;
}

// ─── runWizard ───────────────────────────────────────────────────────────────

/**
 * Legacy wizard entrypoint — kept for backward compatibility.
 * In interactive mode, delegates to the new modular wizard (src/wizard/index.ts).
 * In non-interactive mode, builds config directly from provided opts.
 */

export async function runWizard(opts: WizardOptions = {}): Promise<void> {
  const configDir = opts.configDir ?? join(homedir(), '.reeboot');
  const configPath = join(configDir, 'config.json');
  const interactive = opts.interactive !== false;

  if (interactive) {
    // Delegate to new wizard
    const { runSetupWizard } = await import('./wizard/index.js');
    await runSetupWizard({ configPath, configDir });
    return;
  }

  // Non-interactive: build config from provided flags directly (defensively merge with existing)
  const answers = {
    provider: opts.provider ?? '',
    apiKey: opts.apiKey ?? '',
    model: opts.model ?? '',
    channels: opts.channels ? opts.channels.split(',').map(s => s.trim()) : ['web'],
    name: opts.name ?? 'Reeboot',
  };

  let rawExisting: unknown = null;
  try {
    rawExisting = loadConfig(configPath);
  } catch {
    // No existing config — use defaults
  }

  const existing = (rawExisting && typeof rawExisting === 'object') ? (rawExisting as Config) : null;

  const config: Config = {
    ...fb(existing, defaultConfig),
    agent: {
      ...fb(existing?.agent, defaultConfig.agent),
      name: answers.name,
      runner: fb(existing?.agent, defaultConfig.agent).runner,
      model: {
        authMode: (opts.authMode ?? 'own') as 'pi' | 'own',
        provider: opts.authMode === 'pi' ? '' : answers.provider,
        id: opts.authMode === 'pi' ? '' : answers.model,
        apiKey: opts.authMode === 'pi' ? '' : answers.apiKey,
      },
      turnTimeout: fb(existing?.agent, defaultConfig.agent).turnTimeout,
    },
    channels: {
      web: {
        ...fb(existing?.channels?.web, defaultConfig.channels.web),
        enabled: answers.channels.includes('web'),
      },
      whatsapp: {
        ...fb(existing?.channels?.whatsapp, defaultConfig.channels.whatsapp),
        enabled: answers.channels.includes('whatsapp'),
      },
      signal: {
        ...fb(existing?.channels?.signal, defaultConfig.channels.signal),
        enabled: answers.channels.includes('signal'),
        phoneNumber: fb(existing?.channels?.signal, defaultConfig.channels.signal).phoneNumber,
        apiPort: fb(existing?.channels?.signal, defaultConfig.channels.signal).apiPort,
        pollInterval: fb(existing?.channels?.signal, defaultConfig.channels.signal).pollInterval,
      },
    },
    sandbox: fb(existing?.sandbox, defaultConfig.sandbox),
    logging: fb(existing?.logging, defaultConfig.logging),
    server: fb(existing?.server, defaultConfig.server),
    extensions: fb(existing?.extensions, defaultConfig.extensions),
    routing: fb(existing?.routing, defaultConfig.routing),
    session: fb(existing?.session, defaultConfig.session),
    credentialProxy: fb(existing?.credentialProxy, defaultConfig.credentialProxy),
    search: fb(existing?.search, defaultConfig.search),
    heartbeat: fb(existing?.heartbeat, defaultConfig.heartbeat),
    skills: fb(existing?.skills, defaultConfig.skills),
    mcp: fb(existing?.mcp, defaultConfig.mcp),
    permissions: fb(existing?.permissions, defaultConfig.permissions),
    security: fb(existing?.security, defaultConfig.security),
    contexts: existing?.contexts ?? defaultConfig.contexts,
    memory: fb(existing?.memory, defaultConfig.memory),
    knowledge: fb(existing?.knowledge, defaultConfig.knowledge),
    resilience: fb(existing?.resilience, defaultConfig.resilience),
  };

  // Write config
  mkdirSync(configDir, { recursive: true });
  saveConfig(config, configPath);
  console.log(`✓ Config written to ${configPath}`);

  // Scaffold directories
  scaffoldDirectories(configDir);
  console.log(`✓ Directories scaffolded in ${configDir}`);

  // Scaffold template files
  scaffoldTemplates(configDir);
  console.log(`✓ Templates scaffolded`);
}

// ─── Directory scaffolding ────────────────────────────────────────────────────

function scaffoldDirectories(configDir: string): void {
  const dirs = [
    join(configDir, 'contexts', 'global'),
    join(configDir, 'contexts', 'main', 'workspace'),
    join(configDir, 'contexts', 'main', '.pi', 'extensions'),
    join(configDir, 'contexts', 'main', '.pi', 'skills'),
    join(configDir, 'channels'),
    join(configDir, 'sessions', 'main'),
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

// ─── Template scaffolding ─────────────────────────────────────────────────────

function scaffoldTemplates(configDir: string): void {
  const templatesDir = join(__dirname, '..', 'templates');

  const copies: Array<{ src: string; dest: string }> = [
    {
      src: join(templatesDir, 'global-agents.md'),
      dest: join(configDir, 'contexts', 'global', 'AGENTS.md'),
    },
    {
      src: join(templatesDir, 'main-agents.md'),
      dest: join(configDir, 'contexts', 'main', 'AGENTS.md'),
    },
  ];

  for (const { src, dest } of copies) {
    // Do not overwrite existing AGENTS.md
    if (existsSync(dest)) {
      continue;
    }
    if (existsSync(src)) {
      copyFileSync(src, dest);
    }
  }
}
