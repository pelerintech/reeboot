/**
 * Package system tests (task 4.1) — TDD red
 *
 * Tests installPackage, uninstallPackage, listPackages functions.
 * Uses mocked child_process and fs operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, writeFileSync, rmSync } from 'fs';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSpawnSync = vi.fn();
vi.mock('child_process', () => ({
  spawnSync: mockSpawnSync,
  execSync: vi.fn(),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('packages', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    tmpDir = join(tmpdir(), `reeboot-pkg-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, 'config.json');

    // Write a minimal config
    writeFileSync(configPath, JSON.stringify({
      extensions: { packages: [] },
    }));

    // Default: npm succeeds
    mockSpawnSync.mockReturnValue({ status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── installPackage ─────────────────────────────────────────────────────────

  it('installPackage(npm:...) runs npm install to packages dir', async () => {
    const { installPackage } = await import('@src/packages.js');
    await installPackage('npm:reeboot-github-tools', { configPath, reebotDir: tmpDir });

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['install', '--prefix', expect.stringContaining('packages'), 'reeboot-github-tools']),
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('installPackage adds identifier to config.extensions.packages', async () => {
    const { installPackage } = await import('@src/packages.js');
    await installPackage('npm:reeboot-github-tools', { configPath, reebotDir: tmpDir });

    const config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
    expect(config.extensions.packages).toContain('npm:reeboot-github-tools');
  });

  it('installPackage returns error message when npm fails', async () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: Buffer.from(''), stderr: Buffer.from('Not found') });

    const { installPackage } = await import('@src/packages.js');
    await expect(
      installPackage('npm:does-not-exist-xxxxxx', { configPath, reebotDir: tmpDir })
    ).rejects.toThrow();
  });

  it('installPackage(git:...) passes git URL to npm install', async () => {
    const { installPackage } = await import('@src/packages.js');
    await installPackage('git:github.com/user/my-extension', { configPath, reebotDir: tmpDir });

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['install', '--prefix', expect.any(String), 'github:user/my-extension']),
      expect.anything()
    );
  });

  // ── uninstallPackage ───────────────────────────────────────────────────────

  it('uninstallPackage removes config entry', async () => {
    // Pre-install
    writeFileSync(configPath, JSON.stringify({
      extensions: { packages: ['npm:reeboot-github-tools'] },
    }));

    const { uninstallPackage } = await import('@src/packages.js');
    await uninstallPackage('reeboot-github-tools', { configPath, reebotDir: tmpDir });

    const config = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
    expect(config.extensions.packages).not.toContain('npm:reeboot-github-tools');
  });

  it('uninstallPackage throws when package not in config', async () => {
    const { uninstallPackage } = await import('@src/packages.js');
    await expect(
      uninstallPackage('package-not-installed', { configPath, reebotDir: tmpDir })
    ).rejects.toThrow('Package not installed');
  });

  it('uninstallPackage runs npm uninstall', async () => {
    writeFileSync(configPath, JSON.stringify({
      extensions: { packages: ['npm:reeboot-github-tools'] },
    }));

    const { uninstallPackage } = await import('@src/packages.js');
    await uninstallPackage('reeboot-github-tools', { configPath, reebotDir: tmpDir });

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['uninstall', '--prefix', expect.any(String), 'reeboot-github-tools']),
      expect.anything()
    );
  });

  // ── listPackages ───────────────────────────────────────────────────────────

  it('listPackages returns empty array when no packages installed', async () => {
    const { listPackages } = await import('@src/packages.js');
    const result = await listPackages({ configPath, reebotDir: tmpDir });
    expect(result).toEqual([]);
  });

  it('listPackages returns installed packages from config', async () => {
    writeFileSync(configPath, JSON.stringify({
      extensions: { packages: ['npm:reeboot-github-tools', 'npm:reeboot-browser'] },
    }));

    const { listPackages } = await import('@src/packages.js');
    const result = await listPackages({ configPath, reebotDir: tmpDir });
    expect(result).toHaveLength(2);
    expect(result.map((p: any) => p.spec)).toContain('npm:reeboot-github-tools');
  });
});
