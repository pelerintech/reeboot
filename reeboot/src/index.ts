#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const program = new Command();

program
  .name('reeboot')
  .description('Personal AI agent running locally')
  .version('0.0.1');

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
      await startServer({
        port: config.channels.web.port,
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
    const { runWizard } = await import('./setup-wizard.js');
    await runWizard({ interactive: opts.interactive ?? true, ...opts });
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
      const { execSync, spawnSync } = await import('child_process');
      const { createInterface } = await import('readline');

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

      // Step 2: Check if container already running
      let containerRunning = false;
      try {
        const out = execSync(
          'docker ps --filter name=signal-cli-rest-api --format "{{.Names}}"',
          { stdio: ['pipe', 'pipe', 'pipe'] }
        ).toString().trim();
        containerRunning = out.includes('signal-cli-rest-api');
      } catch { /* ignore */ }

      if (containerRunning) {
        console.log('\n✓ signal-cli-rest-api is already running — skipping Docker steps.');
      } else {
        // Step 3: Pull image
        console.log('\nStep 2: Pulling bbernhard/signal-cli-rest-api...');
        const pull = spawnSync('docker', ['pull', 'bbernhard/signal-cli-rest-api:latest'], {
          stdio: 'inherit',
        });
        if (pull.status !== 0) {
          console.error('  ✗ Failed to pull image. Check your internet connection.');
          process.exit(1);
        }
        console.log('  ✓ Image pulled');

        // Step 4: Start container
        console.log('\nStep 3: Starting signal-cli-rest-api container...');
        const { homedir } = await import('os');
        const { join } = await import('path');
        const { mkdirSync } = await import('fs');
        const signalDir = join(homedir(), '.reeboot', 'channels', 'signal');
        mkdirSync(signalDir, { recursive: true });

        const start = spawnSync('docker', [
          'run', '-d',
          '--name', 'signal-cli-rest-api',
          '-p', '8080:8080',
          '-v', `${signalDir}:/home/.local/share/signal-cli`,
          'bbernhard/signal-cli-rest-api:latest',
        ], { stdio: 'inherit' });

        if (start.status !== 0) {
          console.error('  ✗ Failed to start container. It may already exist (stopped).');
          console.error('    Try: docker start signal-cli-rest-api');
          process.exit(1);
        }
        console.log('  ✓ Container started on port 8080');

        // Wait for container to be ready
        console.log('\n  Waiting for signal-cli to initialize...');
        await new Promise(r => setTimeout(r, 3000));
      }

      // Step 5: Registration / linking guidance
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));

      console.log('\nStep 4: Register or link your phone number');
      console.log('  (a) Register a new number via SMS/voice');
      console.log('  (b) Link an existing Signal account (requires existing Signal app)');
      const choice = await ask('\nEnter (a) or (b): ');

      if (choice.trim().toLowerCase() === 'b') {
        console.log('\nTo link an existing Signal account:');
        console.log('  1. Open your Signal app on your phone');
        console.log('  2. Go to Settings → Linked Devices → + button');
        console.log('  3. Run this command in another terminal:');
        console.log('     curl -X GET "http://localhost:8080/v1/qrcodelink?device_name=reeboot"');
        console.log('  4. Scan the QR code from the curl output with your Signal app');
        console.log('\nAfter linking, add to your ~/.reeboot/config.json:');
        console.log('  "channels": { "signal": { "enabled": true, "phoneNumber": "+YOURNUMBER" } }');
      } else {
        const phone = await ask('\nEnter your phone number (e.g., +1234567890): ');
        console.log(`\nRegistering ${phone.trim()} via SMS...`);
        console.log(`  Run: curl -X POST "http://localhost:8080/v1/register/${encodeURIComponent(phone.trim())}"`);
        const code = await ask('\nEnter the verification code you received: ');
        console.log(`  Run: curl -X POST "http://localhost:8080/v1/register/${encodeURIComponent(phone.trim())}/code/${code.trim()}"`);
        console.log('\nAfter verifying, add to your ~/.reeboot/config.json:');
        console.log(`  "channels": { "signal": { "enabled": true, "phoneNumber": "${phone.trim()}" } }`);
      }

      rl.close();
      console.log('\nDone! Run "reeboot start" to activate Signal messaging.\n');
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

// ─── Error on unknown commands ───────────────────────────────────────────────

program.on('command:*', () => {
  console.error(`Unknown command: ${program.args.join(' ')}`);
  console.error('Run "reeboot --help" for available commands.');
  process.exit(1);
});

program.parse(process.argv);
