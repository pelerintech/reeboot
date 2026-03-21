#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Prompter } from './wizard/prompter.js';

const program = new Command();

program
  .name('reeboot')
  .description('Personal AI agent running locally')
  .version(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);

// ─── handleDefaultAction ──────────────────────────────────────────────────────

/**
 * Exported for testing: determines whether to run the wizard or start the agent.
 * Checks config path existence (using REEBOOT_CONFIG_PATH env var if set).
 */
export interface DefaultActionDeps {
  runWizard?: (opts: { configPath: string }) => Promise<void>
  startAgent?: (configPath: string) => Promise<void>
}

export async function handleDefaultAction(opts: {
  configPath?: string
  _deps?: DefaultActionDeps
} = {}): Promise<void> {
  const configPath = opts.configPath
    ?? process.env.REEBOOT_CONFIG_PATH
    ?? join(homedir(), '.reeboot', 'config.json');

  const deps = opts._deps ?? {};

  if (!existsSync(configPath)) {
    if (deps.runWizard) {
      await deps.runWizard({ configPath });
    } else {
      const { runSetupWizard } = await import('./wizard/index.js');
      await runSetupWizard({ configPath });
    }
  } else {
    if (deps.startAgent) {
      await deps.startAgent(configPath);
    } else {
      const { loadConfig } = await import('./config.js');
      const { startServer } = await import('./server.js');
      const config = loadConfig(configPath);
      await startServer({
        port: config.channels.web.port,
        host: process.env.REEBOOT_HOST ?? '127.0.0.1',
        logLevel: config.logging.level,
        token: config.server.token,
        config,
      });
      console.log(`✓ WebChat ready at http://localhost:${config.channels.web.port}`);
    }
  }
}

// ─── runSetupCommand ──────────────────────────────────────────────────────────

/**
 * Exported for testing: `reeboot setup` handler.
 * If config exists, prompts for overwrite confirmation before running wizard.
 */
export interface SetupCommandDeps {
  runWizard?: (opts: { configPath: string; prompter?: Prompter }) => Promise<void>
}

export async function runSetupCommand(opts: {
  configPath?: string;
  prompter?: Prompter;
  _deps?: SetupCommandDeps;
} = {}): Promise<void> {
  const configPath = opts.configPath
    ?? process.env.REEBOOT_CONFIG_PATH
    ?? join(homedir(), '.reeboot', 'config.json');

  if (existsSync(configPath)) {
    let confirmed: boolean;
    if (opts.prompter) {
      confirmed = await opts.prompter.confirm({
        message: 'Config already exists. Overwrite?',
        default: false,
      });
    } else {
      const { default: inquirer } = await import('inquirer');
      const { overwrite } = await inquirer.prompt([{
        type: 'confirm',
        name: 'overwrite',
        message: 'Config already exists. Overwrite?',
        default: false,
      }]);
      confirmed = overwrite;
    }
    if (!confirmed) {
      console.log('Setup cancelled. Existing config preserved.');
      return;
    }
  }

  const deps = opts._deps ?? {};
  if (deps.runWizard) {
    await deps.runWizard({ configPath, prompter: opts.prompter });
  } else {
    const { runSetupWizard } = await import('./wizard/index.js');
    await runSetupWizard({ configPath, prompter: opts.prompter });
  }
}

// ─── start ───────────────────────────────────────────────────────────────────

program
  .command('start')
  .description('Start the reeboot agent server')
  .option('--no-interactive', 'Run in non-interactive mode (skip wizard prompts)')
  .option('--daemon', 'Run as a background service (launchd on macOS, systemd on Linux)')
  .option('--provider <provider>', 'LLM provider (non-interactive)')
  .option('--api-key <key>', 'API key (non-interactive)')
  .option('--model <model>', 'Model ID (non-interactive)')
  .option('--channels <channels>', 'Channels comma-separated (non-interactive)')
  .option('--name <name>', 'Agent name (non-interactive)')
  .action(async (opts) => {
    if (opts.daemon) {
      const { startDaemon } = await import('./daemon.js');
      console.log('Registering reeboot as a background service...');
      try {
        await startDaemon({
          reebotBin: process.argv[1],
        });
        console.log('Done. Reeboot will start automatically on login.');
      } catch (err: any) {
        console.error(`Failed to register daemon: ${err.message}`);
        process.exit(1);
      }
      return;
    }

    const configPath = join(homedir(), '.reeboot', 'config.json');
    if (!existsSync(configPath)) {
      // No config — launch wizard
      const { runWizard } = await import('./setup-wizard.js');
      await runWizard({ interactive: opts.interactive ?? true, ...opts });
    } else {
      const { loadConfig } = await import('./config.js');
      const { startServer } = await import('./server.js');
      const config = loadConfig(configPath);
      console.log(`Starting reeboot on port ${config.channels.web.port}...`);
      const authMode = config.agent.model.authMode ?? 'own';
      if (authMode === 'pi') {
        console.log(`[reeboot] auth: using pi's provider, model and auth`);
      } else {
        console.log(`[reeboot] auth: own (provider=${config.agent.model.provider})`);
      }
      await startServer({
        port: config.channels.web.port,
        host: process.env.REEBOOT_HOST ?? '127.0.0.1',
        logLevel: config.logging.level,
        token: config.server.token,
        config,
      });
      console.log(`Server running at http://localhost:${config.channels.web.port}`);
    }
  });

// ─── stop ────────────────────────────────────────────────────────────────────

program
  .command('stop')
  .description('Stop the reeboot daemon service (does not unregister it)')
  .action(async () => {
    const { stopDaemon } = await import('./daemon.js');
    console.log('Stopping reeboot daemon...');
    try {
      await stopDaemon();
      console.log('Done.');
    } catch (err: any) {
      console.error(`Failed to stop daemon: ${err.message}`);
      process.exit(1);
    }
  });

// ─── setup ───────────────────────────────────────────────────────────────────

program
  .command('setup')
  .description('Run the interactive setup wizard')
  .option('--no-interactive', 'Run in non-interactive mode')
  .option('--provider <provider>', 'LLM provider')
  .option('--api-key <key>', 'API key')
  .option('--model <model>', 'Model ID')
  .option('--channels <channels>', 'Channels comma-separated')
  .option('--name <name>', 'Agent name')
  .action(async (opts) => {
    await runSetupCommand({ configPath: undefined });
    // Note: interactive opts handled inside runSetupCommand/runSetupWizard
  });

// ─── default action (no subcommand) ──────────────────────────────────────────

program
  .action(async () => {
    await handleDefaultAction();
  });

// ─── status ──────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show agent status')
  .action(async () => {
    const { loadConfig } = await import('./config.js');
    const config = loadConfig();
    const port = config.channels.web.port;
    try {
      const res = await fetch(`http://localhost:${port}/api/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      console.log(JSON.stringify(body, null, 2));
    } catch (err: any) {
      console.error(`Could not reach server on port ${port}: ${err.message}`);
      process.exit(1);
    }
  });

// ─── doctor ──────────────────────────────────────────────────────────────────

program
  .command('doctor')
  .description('Run pre-flight diagnostics on your reeboot installation')
  .option('--skip-network', 'Skip network-dependent checks (API key, Signal version)')
  .action(async (opts) => {
    const { runDoctor, formatResult, doctorExitCode } = await import('./doctor.js');
    console.log('Running reeboot diagnostics...\n');
    const results = await runDoctor({ skipNetwork: opts.skipNetwork ?? false });
    for (const r of results) {
      console.log(formatResult(r));
    }
    console.log('');
    const code = doctorExitCode(results);
    if (code === 0) {
      console.log('All checks passed (or only warnings).');
    } else {
      console.log('Some checks failed. See above for fix instructions.');
    }
    process.exit(code);
  });

// ─── reload ──────────────────────────────────────────────────────────────────

program
  .command('reload')
  .description('Hot-reload extensions and skills on the running agent')
  .action(async () => {
    const { loadConfig } = await import('./config.js');
    const config = loadConfig();
    const port = config.channels.web.port;
    try {
      const res = await fetch(`http://localhost:${port}/api/reload`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log('Extensions and skills reloaded.');
    } catch (err: any) {
      console.error(`Reload failed: ${err.message}`);
      process.exit(1);
    }
  });

// ─── restart ─────────────────────────────────────────────────────────────────

program
  .command('restart')
  .description('Gracefully restart the agent')
  .action(async () => {
    const { loadConfig } = await import('./config.js');
    const config = loadConfig();
    const port = config.channels.web.port;
    try {
      const res = await fetch(`http://localhost:${port}/api/restart`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log('Restart initiated.');
    } catch (err: any) {
      console.error(`Restart failed: ${err.message}`);
      process.exit(1);
    }
  });

// ─── install ─────────────────────────────────────────────────────────────────

program
  .command('install <package>')
  .description('Install a pi-compatible package (e.g., npm:reeboot-github-tools, git:github.com/user/pkg)')
  .action(async (pkg: string) => {
    const { installPackage } = await import('./packages.js');
    console.log(`Installing ${pkg}...`);
    try {
      await installPackage(pkg);
      console.log(`Installed ${pkg}. Run 'reeboot reload' to activate.`);
    } catch (err: any) {
      console.error(err.message);
      process.exit(1);
    }
  });

// ─── uninstall ───────────────────────────────────────────────────────────────

program
  .command('uninstall <package>')
  .description('Uninstall an installed package by name')
  .action(async (pkg: string) => {
    const { uninstallPackage } = await import('./packages.js');
    try {
      await uninstallPackage(pkg);
      console.log(`Uninstalled ${pkg}.`);
    } catch (err: any) {
      console.error(err.message);
      process.exit(1);
    }
  });

// ─── packages ────────────────────────────────────────────────────────────────

const packages = program
  .command('packages')
  .description('Package management commands');

packages
  .command('list')
  .description('List installed packages')
  .action(async () => {
    const { listPackages } = await import('./packages.js');
    const pkgs = await listPackages();
    if (pkgs.length === 0) {
      console.log('No packages installed.');
      return;
    }
    console.log('Installed packages:');
    console.log('Name                            Spec');
    console.log('──────────────────────────────  ──────────────────────────────────');
    for (const pkg of pkgs) {
      console.log(`${pkg.name.padEnd(30)}  ${pkg.spec}`);
    }
  });

// ─── channels ────────────────────────────────────────────────────────────────

const channels = program
  .command('channels')
  .description('Channel management commands');

channels
  .command('list')
  .description('List configured channels and their statuses')
  .action(async () => {
    const { loadConfig } = await import('./config.js');
    const config = loadConfig();
    const port = config.channels.web.port;
    try {
      const res = await fetch(`http://localhost:${port}/api/channels`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json() as any[];
      if (body.length === 0) {
        console.log('No channels configured.');
        return;
      }
      console.log('Channel   Status        Connected At');
      console.log('────────  ────────────  ────────────────────');
      for (const ch of body) {
        const connectedAt = ch.connectedAt ? new Date(ch.connectedAt).toLocaleString() : '—';
        console.log(`${ch.type.padEnd(8)}  ${ch.status.padEnd(12)}  ${connectedAt}`);
      }
    } catch (err: any) {
      console.error(`Could not reach server on port ${port}: ${err.message}`);
      process.exit(1);
    }
  });

channels
  .command('login <type>')
  .description('Login to a channel (e.g., whatsapp, signal)')
  .action(async (type: string) => {
    if (type === 'whatsapp') {
      console.log('Starting WhatsApp login — scan the QR code in the terminal...');
      const { join } = await import('path');
      const { homedir } = await import('os');
      const { WhatsAppAdapter } = await import('./channels/whatsapp.js');
      const { MessageBus } = await import('./channels/interface.js');

      const authDir = join(homedir(), '.reeboot', 'channels', 'whatsapp', 'auth');
      const adapter = new WhatsAppAdapter(authDir);
      const bus = new MessageBus();

      await adapter.init({ enabled: true }, bus);
      await adapter.start();

      // Wait for connection or error
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          const s = adapter.status();
          if (s === 'connected') {
            clearInterval(check);
            console.log('WhatsApp connected.');
            resolve();
          } else if (s === 'error') {
            clearInterval(check);
            console.error('WhatsApp login failed.');
            process.exit(1);
          }
        }, 500);
      });

      await adapter.stop();
      process.exit(0);
    } else if (type === 'signal') {
      const { execSync, spawnSync, spawn } = await import('child_process');
      const { createInterface } = await import('readline');
      const { homedir } = await import('os');
      const { join } = await import('path');
      const { mkdirSync } = await import('fs');
      const qrTerminal = await import('qrcode-terminal');

      const SIGNAL_API_PORT = 8080;
      const signalDir = join(homedir(), '.reeboot', 'channels', 'signal');

      console.log('\n📡 Signal setup via signal-cli-rest-api\n');

      // Step 1: Check Docker
      console.log('Step 1: Checking Docker...');
      try {
        execSync('docker info', { stdio: ['pipe', 'pipe', 'pipe'] });
        console.log('  ✓ Docker is running');
      } catch {
        console.error('  ✗ Docker is not running or not installed.');
        console.error('    Fix: Install Docker from https://docs.docker.com/get-docker/');
        console.error('         Then start Docker Desktop (or systemctl start docker).');
        process.exit(1);
      }

      // Step 2: Check / start container in native mode (required for linking)
      const isContainerRunning = () => {
        try {
          return execSync(
            'docker ps --filter name=signal-cli-rest-api --format "{{.Names}}"',
            { stdio: ['pipe', 'pipe', 'pipe'] }
          ).toString().trim().includes('signal-cli-rest-api');
        } catch { return false; }
      };

      const isContainerStopped = () => {
        try {
          return execSync(
            'docker ps -a --filter name=signal-cli-rest-api --filter status=exited --format "{{.Names}}"',
            { stdio: ['pipe', 'pipe', 'pipe'] }
          ).toString().trim().includes('signal-cli-rest-api');
        } catch { return false; }
      };

      if (isContainerRunning()) {
        console.log('\n  ℹ signal-cli-rest-api is already running.');
        console.log('  Restarting in native mode for linking...');
        spawnSync('docker', ['stop', 'signal-cli-rest-api'], { stdio: 'pipe' });
        spawnSync('docker', ['rm', 'signal-cli-rest-api'], { stdio: 'pipe' });
      } else if (isContainerStopped()) {
        spawnSync('docker', ['rm', 'signal-cli-rest-api'], { stdio: 'pipe' });
      } else {
        // Pull image
        console.log('\nStep 2: Pulling bbernhard/signal-cli-rest-api...');
        const pull = spawnSync('docker', ['pull', 'bbernhard/signal-cli-rest-api:latest'], {
          stdio: 'inherit',
        });
        if (pull.status !== 0) {
          console.error('  ✗ Failed to pull image. Check your internet connection.');
          process.exit(1);
        }
        console.log('  ✓ Image pulled');
      }

      // Start container in native mode (required for QR linking handshake)
      console.log('\nStep 3: Starting container in native mode for linking...');
      mkdirSync(signalDir, { recursive: true });

      const start = spawnSync('docker', [
        'run', '-d',
        '--name', 'signal-cli-rest-api',
        '-p', `${SIGNAL_API_PORT}:8080`,
        '-v', `${signalDir}:/home/.local/share/signal-cli`,
        '-e', 'MODE=native',
        'bbernhard/signal-cli-rest-api:latest',
      ], { stdio: 'pipe' });

      if (start.status !== 0) {
        console.error('  ✗ Failed to start container.');
        console.error(start.stderr?.toString());
        process.exit(1);
      }

      // Wait for native mode to be ready
      process.stdout.write('  Waiting for signal-cli to initialize...');
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        process.stdout.write('.');
        try {
          const res = await fetch(`http://127.0.0.1:${SIGNAL_API_PORT}/v1/about`);
          if (res.ok) { console.log(' ✓'); break; }
        } catch { /* not ready yet */ }
        if (i === 14) { console.log(''); console.error('  ✗ Container did not become ready in time.'); process.exit(1); }
      }

      // Step 4: Register or link
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));

      console.log('\nStep 4: Register or link your phone number');
      console.log('  (a) Register a new number via SMS/voice');
      console.log('  (b) Link an existing Signal account (scan QR in terminal)');
      const choice = (await ask('\nEnter (a) or (b): ')).trim().toLowerCase();

      if (choice === 'b') {
        console.log('\n📱 Generating QR code...\n');

        const linkProc = spawn('docker', [
          'exec', 'signal-cli-rest-api',
          'signal-cli', 'link', '--name', 'reeboot',
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        let linked = false;

        await new Promise<void>((resolve, reject) => {
          let output = '';

          linkProc.stdout.on('data', (chunk: Buffer) => {
            output += chunk.toString();
            const match = output.match(/(sgnl:\/\/[^\s\n]+)/);
            if (match && !linked) {
              const uri = match[1];
              (qrTerminal as any).default.generate(uri, { small: true });
              console.log('Scan this QR code with your Signal app:');
              console.log('  Settings → Linked Devices → + button\n');
              console.log('Waiting for you to scan...');
            }
          });

          linkProc.on('close', (code: number) => {
            if (code === 0) {
              linked = true;
              resolve();
            } else {
              reject(new Error(`signal-cli link exited with code ${code}`));
            }
          });

          linkProc.on('error', reject);
        }).catch((err) => {
          console.error(`\n  ✗ Linking failed: ${err.message}`);
          rl.close();
          process.exit(1);
        });

        console.log('  ✓ Device linked successfully!');

      } else {
        // Register a new number
        const phone = (await ask('\nEnter your phone number (e.g., +1234567890): ')).trim();

        console.log(`\nSending verification SMS to ${phone}...`);
        const regRes = await fetch(
          `http://127.0.0.1:${SIGNAL_API_PORT}/v1/register/${encodeURIComponent(phone)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
        );
        if (!regRes.ok) {
          const body = await regRes.text();
          console.error(`  ✗ Registration failed: ${body}`);
          rl.close();
          process.exit(1);
        }
        console.log('  ✓ SMS sent');

        const code = (await ask('Enter the verification code you received: ')).trim();
        const verRes = await fetch(
          `http://127.0.0.1:${SIGNAL_API_PORT}/v1/register/${encodeURIComponent(phone)}/code/${code}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
        );
        if (!verRes.ok) {
          const body = await verRes.text();
          console.error(`  ✗ Verification failed: ${body}`);
          rl.close();
          process.exit(1);
        }
        console.log('  ✓ Number verified');
      }

      rl.close();

      // Step 5: Restart container in json-rpc mode for production use
      console.log('\nStep 5: Restarting container in json-rpc mode for production...');
      spawnSync('docker', ['stop', 'signal-cli-rest-api'], { stdio: 'pipe' });
      spawnSync('docker', ['rm', 'signal-cli-rest-api'], { stdio: 'pipe' });

      const restart = spawnSync('docker', [
        'run', '-d',
        '--name', 'signal-cli-rest-api',
        '--restart', 'always',
        '-p', `${SIGNAL_API_PORT}:8080`,
        '-v', `${signalDir}:/home/.local/share/signal-cli`,
        '-e', 'MODE=json-rpc',
        'bbernhard/signal-cli-rest-api:latest',
      ], { stdio: 'pipe' });

      if (restart.status !== 0) {
        console.error('  ✗ Failed to restart container in json-rpc mode.');
        console.error(restart.stderr?.toString());
        process.exit(1);
      }
      console.log('  ✓ Container running in json-rpc mode');

      // Detect phone number from accounts
      process.stdout.write('\nDetecting registered phone number...');
      let detectedPhone = '';
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        process.stdout.write('.');
        try {
          const res = await fetch(`http://127.0.0.1:${SIGNAL_API_PORT}/v1/accounts`);
          if (res.ok) {
            const accounts = await res.json() as string[];
            if (accounts.length > 0) { detectedPhone = accounts[0]; break; }
          }
        } catch { /* not ready yet */ }
      }
      console.log(detectedPhone ? ` ✓ ${detectedPhone}` : ' (could not detect — check manually)');

      console.log('\n✅ Signal setup complete!');
      console.log('\nAdd this to your ~/.reeboot/config.json:');
      console.log(JSON.stringify({
        channels: {
          signal: {
            enabled: true,
            phoneNumber: detectedPhone || '+YOURNUMBER',
            apiPort: SIGNAL_API_PORT,
            pollInterval: 1000,
          }
        }
      }, null, 2));
      console.log('\nThen run: reeboot start\n');
      process.exit(0);
    } else {
      console.log(`channels login ${type}: not yet implemented`);
    }
  });

channels
  .command('logout <type>')
  .description('Logout from a channel')
  .action(async (type: string) => {
    const { loadConfig } = await import('./config.js');
    const config = loadConfig();
    const port = config.channels.web.port;
    try {
      const res = await fetch(`http://localhost:${port}/api/channels/${type}/logout`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`${type} logged out.`);
    } catch (err: any) {
      console.error(`Could not reach server on port ${port}: ${err.message}`);
      process.exit(1);
    }
  });

// ─── contexts ────────────────────────────────────────────────────────────────

const contexts = program
  .command('contexts')
  .description('Context management commands');

contexts
  .command('list')
  .description('List contexts (stub)')
  .action(() => {
    console.log('contexts list: not yet implemented');
  });

contexts
  .command('create <name>')
  .description('Create a context (stub)')
  .action((name: string) => {
    console.log(`contexts create ${name}: not yet implemented`);
  });

// ─── sessions ────────────────────────────────────────────────────────────────

const sessions = program
  .command('sessions')
  .description('Session management commands');

sessions
  .command('list')
  .description('List sessions (stub)')
  .action(() => {
    console.log('sessions list: not yet implemented');
  });


// ─── tasks ───────────────────────────────────────────────────────────────────

const tasks = program
  .command('tasks')
  .description('Task management commands');

tasks
  .command('due')
  .description('List overdue scheduled tasks')
  .action(async () => {
    const { join } = await import('path');
    const { homedir } = await import('os');
    const Database = (await import('better-sqlite3')).default;
    const { runMigration } = await import('./db/schema.js');
    const { getTasksDue, formatTasksDue } = await import('./scheduler.js');

    const dbPath = join(homedir(), '.reeboot', 'reeboot.db');
    let db: any;
    try {
      db = new Database(dbPath, { readonly: true });
    } catch {
      console.error('No reeboot database found. Run "reeboot start" first.');
      process.exit(1);
    }

    const due = getTasksDue(db);
    console.log(formatTasksDue(due as any));
    db.close();
  });


// ─── skills ──────────────────────────────────────────────────────────────────

const skillsCmd = program
  .command('skills')
  .description('Skill catalog commands');

skillsCmd
  .command('list')
  .description('List all bundled skills')
  .action(async () => {
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const { printSkillsList } = await import('./skills-cli.js');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const skillsDir = join(__dirname, '..', 'skills');
    printSkillsList(skillsDir);
    process.exit(0);
  });

skillsCmd
  .command('update')
  .description('Update extended skill catalog')
  .action(async () => {
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const { getSkillsUpdateMessage } = await import('./skills-cli.js');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const skillsDir = join(__dirname, '..', 'skills');
    console.log(getSkillsUpdateMessage(skillsDir));
    process.exit(0);
  });

program.on('command:*', () => {
  console.error(`Unknown command: ${program.args.join(' ')}`);
  console.error('Run "reeboot --help" for available commands.');
  process.exit(1);
});

program.parse(process.argv);
