/**
 * Daemon mode
 *
 * Generates and registers service unit files for macOS (launchd) and Linux (systemd).
 * Logs to ~/.reeboot/logs/.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { homedir } from 'os';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StartDaemonOptions {
  platform?: 'darwin' | 'linux' | string;
  reebotBin?: string;
  reebotDir?: string;
  /** macOS: override ~/Library/LaunchAgents dir (for testing) */
  launchAgentsDir?: string;
  /** Linux: override ~/.config/systemd/user dir (for testing) */
  systemdDir?: string;
}

export interface StopDaemonOptions {
  platform?: 'darwin' | 'linux' | string;
  /** macOS: override ~/Library/LaunchAgents dir (for testing) */
  launchAgentsDir?: string;
  /** Linux: override ~/.config/systemd/user dir (for testing) */
  systemdDir?: string;
}

// ─── macOS plist ──────────────────────────────────────────────────────────────

function generatePlist(reebotBin: string, reebotDir: string): string {
  const logsDir = join(reebotDir, 'logs');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.reeboot.agent</string>

  <key>ProgramArguments</key>
  <array>
    <string>${reebotBin}</string>
    <string>start</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${logsDir}/reeboot.log</string>

  <key>StandardErrorPath</key>
  <string>${logsDir}/reeboot-error.log</string>

  <key>WorkingDirectory</key>
  <string>${reebotDir}</string>
</dict>
</plist>
`;
}

// ─── Linux systemd unit ───────────────────────────────────────────────────────

function generateSystemdUnit(reebotBin: string, reebotDir: string): string {
  const logsDir = join(reebotDir, 'logs');
  return `[Unit]
Description=Reeboot Personal AI Agent
After=network.target

[Service]
Type=simple
ExecStart=${reebotBin} start
Restart=on-failure
RestartSec=5
WorkingDirectory=${reebotDir}
StandardOutput=append:${logsDir}/reeboot.log
StandardError=append:${logsDir}/reeboot-error.log

[Install]
WantedBy=default.target
`;
}

// ─── startDaemon ─────────────────────────────────────────────────────────────

export async function startDaemon(opts: StartDaemonOptions = {}): Promise<void> {
  const platform = opts.platform ?? process.platform;
  const reebotDir = opts.reebotDir ?? join(homedir(), '.reeboot');
  const reebotBin = opts.reebotBin ?? process.execPath.replace('node', 'reeboot');
  const logsDir = join(reebotDir, 'logs');

  // Ensure logs directory exists
  mkdirSync(logsDir, { recursive: true });

  if (platform === 'darwin') {
    const launchAgentsDir = opts.launchAgentsDir ?? join(homedir(), 'Library', 'LaunchAgents');
    mkdirSync(launchAgentsDir, { recursive: true });

    const plistPath = join(launchAgentsDir, 'com.reeboot.agent.plist');
    const plist = generatePlist(reebotBin, reebotDir);
    writeFileSync(plistPath, plist, 'utf-8');

    console.log(`[daemon] Wrote ${plistPath}`);

    try {
      execSync(`launchctl load -w ${plistPath}`, { stdio: ['pipe', 'pipe', 'pipe'] });
      console.log('[daemon] Registered with launchd — reeboot will start on login.');
    } catch (err: any) {
      console.error(`[daemon] launchctl load failed: ${err.message}`);
      throw err;
    }
  } else if (platform === 'linux') {
    const systemdDir = opts.systemdDir ?? join(homedir(), '.config', 'systemd', 'user');
    mkdirSync(systemdDir, { recursive: true });

    const unitPath = join(systemdDir, 'reeboot.service');
    const unit = generateSystemdUnit(reebotBin, reebotDir);
    writeFileSync(unitPath, unit, 'utf-8');

    console.log(`[daemon] Wrote ${unitPath}`);

    try {
      execSync('systemctl --user daemon-reload', { stdio: ['pipe', 'pipe', 'pipe'] });
      execSync('systemctl --user enable --now reeboot', { stdio: ['pipe', 'pipe', 'pipe'] });
      console.log('[daemon] Registered with systemd — reeboot enabled for current user.');
    } catch (err: any) {
      console.error(`[daemon] systemctl failed: ${err.message}`);
      throw err;
    }
  } else {
    throw new Error(`Daemon mode not supported on platform: ${platform}. Use a process manager like pm2.`);
  }
}

// ─── stopDaemon ──────────────────────────────────────────────────────────────

export async function stopDaemon(opts: StopDaemonOptions = {}): Promise<void> {
  const platform = opts.platform ?? process.platform;

  if (platform === 'darwin') {
    const launchAgentsDir = opts.launchAgentsDir ?? join(homedir(), 'Library', 'LaunchAgents');
    const plistPath = join(launchAgentsDir, 'com.reeboot.agent.plist');

    try {
      execSync(`launchctl unload ${plistPath}`, { stdio: ['pipe', 'pipe', 'pipe'] });
      console.log('[daemon] Stopped reeboot (launchd). Service remains registered for next login.');
    } catch (err: any) {
      // Not running — that's fine
      console.warn(`[daemon] launchctl unload: ${err.message}`);
    }
  } else if (platform === 'linux') {
    try {
      execSync('systemctl --user stop reeboot', { stdio: ['pipe', 'pipe', 'pipe'] });
      console.log('[daemon] Stopped reeboot (systemd). Service remains enabled for next boot.');
    } catch (err: any) {
      console.warn(`[daemon] systemctl stop: ${err.message}`);
    }
  } else {
    throw new Error(`Daemon stop not supported on platform: ${platform}.`);
  }
}
