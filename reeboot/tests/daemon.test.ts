/**
 * Daemon mode tests (task 6.1) — TDD red
 *
 * Tests startDaemon() and stopDaemon() with platform mocks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, existsSync, rmSync } from 'fs';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
  execSync: mockExecSync,
  spawnSync: vi.fn().mockReturnValue({ status: 0 }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('daemon mode — macOS', () => {
  let tmpDir: string;
  let launchAgentsDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockExecSync.mockReturnValue(Buffer.from(''));

    tmpDir = join(tmpdir(), `reeboot-daemon-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    launchAgentsDir = join(tmpDir, 'LaunchAgents');
    mkdirSync(launchAgentsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('startDaemon on macOS generates plist file', async () => {
    const { startDaemon } = await import('@src/daemon.js');
    await startDaemon({
      platform: 'darwin',
      reebotBin: '/usr/local/bin/reeboot',
      reebotDir: tmpDir,
      launchAgentsDir,
    });

    const plistPath = join(launchAgentsDir, 'com.reeboot.agent.plist');
    expect(existsSync(plistPath)).toBe(true);
  });

  it('plist file contains correct binary path', async () => {
    const { startDaemon } = await import('@src/daemon.js');
    await startDaemon({
      platform: 'darwin',
      reebotBin: '/usr/local/bin/reeboot',
      reebotDir: tmpDir,
      launchAgentsDir,
    });

    const { readFileSync } = await import('fs');
    const plistPath = join(launchAgentsDir, 'com.reeboot.agent.plist');
    const content = readFileSync(plistPath, 'utf-8');
    expect(content).toContain('/usr/local/bin/reeboot');
    expect(content).toContain('com.reeboot.agent');
  });

  it('startDaemon on macOS calls launchctl load', async () => {
    const { startDaemon } = await import('@src/daemon.js');
    await startDaemon({
      platform: 'darwin',
      reebotBin: '/usr/local/bin/reeboot',
      reebotDir: tmpDir,
      launchAgentsDir,
    });

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('launchctl'),
      expect.anything()
    );
  });

  it('stopDaemon on macOS calls launchctl unload', async () => {
    const { stopDaemon } = await import('@src/daemon.js');
    await stopDaemon({
      platform: 'darwin',
      launchAgentsDir,
    });

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('launchctl'),
      expect.anything()
    );
  });

  it('plist sets PI_CACHE_RETENTION=long in EnvironmentVariables', async () => {
    const { startDaemon } = await import('@src/daemon.js');
    await startDaemon({
      platform: 'darwin',
      reebotBin: '/usr/local/bin/reeboot',
      reebotDir: tmpDir,
      launchAgentsDir,
    });

    const { readFileSync: readFile } = await import('fs');
    const plistPath = join(launchAgentsDir, 'com.reeboot.agent.plist');
    const content = readFile(plistPath, 'utf-8');
    expect(content).toContain('PI_CACHE_RETENTION');
    expect(content).toContain('<string>long</string>');
  });

  it('plist references log directory for stdout/stderr', async () => {
    const { startDaemon } = await import('@src/daemon.js');
    await startDaemon({
      platform: 'darwin',
      reebotBin: '/usr/local/bin/reeboot',
      reebotDir: tmpDir,
      launchAgentsDir,
    });

    const { readFileSync } = await import('fs');
    const plistPath = join(launchAgentsDir, 'com.reeboot.agent.plist');
    const content = readFileSync(plistPath, 'utf-8');
    expect(content).toContain('reeboot.log');
  });
});

describe('daemon mode — Linux', () => {
  let tmpDir: string;
  let systemdDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockExecSync.mockReturnValue(Buffer.from(''));

    tmpDir = join(tmpdir(), `reeboot-daemon-linux-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    systemdDir = join(tmpDir, 'systemd', 'user');
    mkdirSync(systemdDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('startDaemon on Linux generates systemd unit file', async () => {
    const { startDaemon } = await import('@src/daemon.js');
    await startDaemon({
      platform: 'linux',
      reebotBin: '/usr/local/bin/reeboot',
      reebotDir: tmpDir,
      systemdDir,
    });

    const unitPath = join(systemdDir, 'reeboot.service');
    expect(existsSync(unitPath)).toBe(true);
  });

  it('systemd unit file contains correct ExecStart', async () => {
    const { startDaemon } = await import('@src/daemon.js');
    await startDaemon({
      platform: 'linux',
      reebotBin: '/usr/local/bin/reeboot',
      reebotDir: tmpDir,
      systemdDir,
    });

    const { readFileSync } = await import('fs');
    const unitPath = join(systemdDir, 'reeboot.service');
    const content = readFileSync(unitPath, 'utf-8');
    expect(content).toContain('ExecStart=/usr/local/bin/reeboot start');
  });

  it('systemd unit file sets PI_CACHE_RETENTION=long', async () => {
    const { startDaemon } = await import('@src/daemon.js');
    await startDaemon({
      platform: 'linux',
      reebotBin: '/usr/local/bin/reeboot',
      reebotDir: tmpDir,
      systemdDir,
    });

    const { readFileSync } = await import('fs');
    const unitPath = join(systemdDir, 'reeboot.service');
    const content = readFileSync(unitPath, 'utf-8');
    expect(content).toContain('Environment=PI_CACHE_RETENTION=long');
  });

  it('startDaemon on Linux calls systemctl enable --now', async () => {
    const { startDaemon } = await import('@src/daemon.js');
    await startDaemon({
      platform: 'linux',
      reebotBin: '/usr/local/bin/reeboot',
      reebotDir: tmpDir,
      systemdDir,
    });

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('systemctl'),
      expect.anything()
    );
  });

  it('stopDaemon on Linux calls systemctl stop', async () => {
    const { stopDaemon } = await import('@src/daemon.js');
    await stopDaemon({
      platform: 'linux',
      systemdDir,
    });

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('systemctl'),
      expect.anything()
    );
  });
});
