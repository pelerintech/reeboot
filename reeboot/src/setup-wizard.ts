import { mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { saveConfig, loadConfig, defaultConfig, type Config } from './config.js';

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

  // Non-interactive: build config from provided flags directly
  const answers = {
    provider: opts.provider ?? '',
    apiKey: opts.apiKey ?? '',
    model: opts.model ?? '',
    channels: opts.channels ? opts.channels.split(',').map(s => s.trim()) : ['web'],
    name: opts.name ?? 'Reeboot',
  };

  // Build config from answers
  const config: Config = {
    ...defaultConfig,
    agent: {
      name: answers.name,
      runner: defaultConfig.agent.runner,
      model: {
        authMode: (opts.authMode ?? 'own') as 'pi' | 'own',
        provider: opts.authMode === 'pi' ? '' : answers.provider,
        id: opts.authMode === 'pi' ? '' : answers.model,
        apiKey: opts.authMode === 'pi' ? '' : answers.apiKey,
      },
      turnTimeout: defaultConfig.agent.turnTimeout,
    },
    channels: {
      web: {
        ...defaultConfig.channels.web,
        enabled: answers.channels.includes('web'),
      },
      whatsapp: {
        ...defaultConfig.channels.whatsapp,
        enabled: answers.channels.includes('whatsapp'),
      },
      signal: {
        ...defaultConfig.channels.signal,
        enabled: answers.channels.includes('signal'),
        phoneNumber: defaultConfig.channels.signal.phoneNumber,
        apiPort: defaultConfig.channels.signal.apiPort,
        pollInterval: defaultConfig.channels.signal.pollInterval,
      },
    },
    sandbox: defaultConfig.sandbox,
    logging: defaultConfig.logging,
    server: defaultConfig.server,
    extensions: defaultConfig.extensions,
    routing: defaultConfig.routing,
    session: defaultConfig.session,
    credentialProxy: defaultConfig.credentialProxy,
    search: defaultConfig.search,
    heartbeat: defaultConfig.heartbeat,
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
