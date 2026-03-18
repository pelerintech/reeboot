import { mkdirSync, existsSync, copyFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { saveConfig, loadConfig, defaultConfig, type Config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WizardOptions {
  interactive?: boolean;
  provider?: string;
  apiKey?: string;
  model?: string;
  channels?: string;
  name?: string;
  /** Override config directory (default: ~/.reeboot) */
  configDir?: string;
}

// ─── runWizard ───────────────────────────────────────────────────────────────

export async function runWizard(opts: WizardOptions = {}): Promise<void> {
  const configDir = opts.configDir ?? join(homedir(), '.reeboot');
  const configPath = join(configDir, 'config.json');
  const interactive = opts.interactive !== false;

  let answers: {
    provider: string;
    apiKey: string;
    model: string;
    channels: string[];
    name: string;
  };

  if (interactive) {
    answers = await runInteractiveWizard(configPath, opts);
  } else {
    // Non-interactive: use provided flags
    answers = {
      provider: opts.provider ?? '',
      apiKey: opts.apiKey ?? '',
      model: opts.model ?? '',
      channels: opts.channels ? opts.channels.split(',').map(s => s.trim()) : ['web'],
      name: opts.name ?? 'Reeboot',
    };
  }

  // Build config from answers
  const config: Config = {
    ...defaultConfig,
    agent: {
      name: answers.name,
      runner: defaultConfig.agent.runner,
      model: {
        provider: answers.provider,
        id: answers.model,
        apiKey: answers.apiKey,
      },
    },
    channels: {
      web: {
        enabled: answers.channels.includes('web'),
        port: defaultConfig.channels.web.port,
      },
      whatsapp: {
        enabled: answers.channels.includes('whatsapp'),
      },
      signal: {
        enabled: answers.channels.includes('signal'),
      },
    },
    sandbox: defaultConfig.sandbox,
    logging: defaultConfig.logging,
    server: defaultConfig.server,
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

// ─── Interactive wizard ───────────────────────────────────────────────────────

async function runInteractiveWizard(
  configPath: string,
  _opts: WizardOptions
): Promise<{ provider: string; apiKey: string; model: string; channels: string[]; name: string }> {
  const { default: inquirer } = await import('inquirer');

  console.log('\n🚀 Welcome to Reeboot Setup Wizard\n');

  // Check if config exists and ask for confirmation
  if (existsSync(configPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'A config already exists. Overwrite it?',
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log('Setup cancelled. Existing config preserved.');
      process.exit(0);
    }
  }

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Select your LLM provider:',
      choices: ['anthropic', 'openai', 'ollama', 'other'],
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your API key:',
      mask: '*',
    },
    {
      type: 'input',
      name: 'model',
      message: 'Enter the model ID:',
      default: 'claude-sonnet-4-20250514',
    },
    {
      type: 'checkbox',
      name: 'channels',
      message: 'Select channels to enable:',
      choices: [
        { name: 'WebChat (built-in web UI)', value: 'web', checked: true },
        { name: 'WhatsApp', value: 'whatsapp' },
        { name: 'Signal', value: 'signal' },
      ],
    },
    {
      type: 'input',
      name: 'name',
      message: 'Agent name:',
      default: 'Reeboot',
    },
  ]);

  return answers;
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
