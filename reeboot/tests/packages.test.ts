/**
 * Package system tests — delegate to pi's DefaultPackageManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockInstall = vi.fn().mockResolvedValue(undefined);
const mockRemove = vi.fn().mockResolvedValue(undefined);
const mockListConfiguredPackages = vi.fn().mockReturnValue([]);

const MockDefaultPackageManager = vi.fn().mockImplementation(() => ({
  install: mockInstall,
  remove: mockRemove,
  listConfiguredPackages: mockListConfiguredPackages,
}));

const mockGetPackages = vi.fn().mockReturnValue([]);
const mockSetPackages = vi.fn().mockResolvedValue(undefined);

const MockSettingsManager = {
  inMemory: vi.fn().mockImplementation(() => ({
    getPackages: mockGetPackages,
    setPackages: mockSetPackages,
  })),
  create: vi.fn().mockImplementation(() => ({
    getPackages: mockGetPackages,
    setPackages: mockSetPackages,
  })),
};

vi.mock('@mariozechner/pi-coding-agent', () => ({
  DefaultPackageManager: MockDefaultPackageManager,
  SettingsManager: MockSettingsManager,
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('packages — pi DefaultPackageManager delegation', () => {
  let tmpDir: string;
  let agentDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    tmpDir = join(tmpdir(), `reeboot-pkg-test-${Date.now()}`);
    agentDir = join(tmpDir, 'agent');
    mkdirSync(agentDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── installPackage ─────────────────────────────────────────────────────────

  it('installPackage delegates to pm.install(spec)', async () => {
    const { installPackage } = await import('@src/packages.js');
    await installPackage('npm:test-ext', { agentDir });

    expect(MockDefaultPackageManager).toHaveBeenCalled();
    expect(mockInstall).toHaveBeenCalledWith('npm:test-ext');
  });

  it('installPackage throws if pm.install rejects', async () => {
    mockInstall.mockRejectedValueOnce(new Error('npm failed'));
    const { installPackage } = await import('@src/packages.js');
    await expect(installPackage('npm:bad-pkg', { agentDir })).rejects.toThrow('npm failed');
  });

  // ── uninstallPackage ───────────────────────────────────────────────────────

  it('uninstallPackage delegates to pm.remove(name)', async () => {
    const { uninstallPackage } = await import('@src/packages.js');
    await uninstallPackage('test-ext', { agentDir });

    expect(MockDefaultPackageManager).toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith('test-ext');
  });

  it('uninstallPackage throws if pm.remove rejects', async () => {
    mockRemove.mockRejectedValueOnce(new Error('not found'));
    const { uninstallPackage } = await import('@src/packages.js');
    await expect(uninstallPackage('missing-pkg', { agentDir })).rejects.toThrow('not found');
  });

  // ── listPackages ───────────────────────────────────────────────────────────

  it('listPackages returns packages from settingsManager.getPackages()', async () => {
    mockGetPackages.mockReturnValueOnce(['npm:ext-a', 'npm:ext-b']);
    const { listPackages } = await import('@src/packages.js');
    const result = await listPackages({ agentDir });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ spec: 'npm:ext-a', name: 'ext-a' });
    expect(result[1]).toEqual({ spec: 'npm:ext-b', name: 'ext-b' });
  });

  it('listPackages returns empty array when no packages installed', async () => {
    mockGetPackages.mockReturnValueOnce([]);
    const { listPackages } = await import('@src/packages.js');
    const result = await listPackages({ agentDir });
    expect(result).toEqual([]);
  });
});

// ─── migratePackages ──────────────────────────────────────────────────────────

describe('migratePackages', () => {
  let tmpDir: string;
  let agentDir: string;
  let configPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    tmpDir = join(tmpdir(), `reeboot-migrate-test-${Date.now()}`);
    agentDir = join(tmpDir, 'agent');
    configPath = join(tmpDir, 'config.json');
    mkdirSync(agentDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('moves extensions.packages from config.json into settingsManager', async () => {
    const { writeFileSync } = await import('fs');
    writeFileSync(configPath, JSON.stringify({
      extensions: { packages: ['npm:old-ext'] },
    }));

    mockGetPackages.mockReturnValue([]);

    const { migratePackages } = await import('@src/packages.js');
    await migratePackages(configPath, agentDir);

    expect(mockSetPackages).toHaveBeenCalledWith(expect.arrayContaining(['npm:old-ext']));
  });

  it('removes extensions.packages from config.json after migration', async () => {
    const { writeFileSync, readFileSync } = await import('fs');
    writeFileSync(configPath, JSON.stringify({
      extensions: { packages: ['npm:old-ext'] },
    }));

    mockGetPackages.mockReturnValue([]);

    const { migratePackages } = await import('@src/packages.js');
    await migratePackages(configPath, agentDir);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.extensions?.packages).toBeUndefined();
  });

  it('does nothing when config.json has no extensions.packages', async () => {
    const { writeFileSync } = await import('fs');
    writeFileSync(configPath, JSON.stringify({ agent: { name: 'test' } }));

    const { migratePackages } = await import('@src/packages.js');
    await migratePackages(configPath, agentDir);

    expect(mockSetPackages).not.toHaveBeenCalled();
  });

  it('skips specs already present in settings.json', async () => {
    const { writeFileSync } = await import('fs');
    writeFileSync(configPath, JSON.stringify({
      extensions: { packages: ['npm:old-ext', 'npm:already-there'] },
    }));

    mockGetPackages.mockReturnValue(['npm:already-there']);

    const { migratePackages } = await import('@src/packages.js');
    await migratePackages(configPath, agentDir);

    const callArg = mockSetPackages.mock.calls[0][0] as string[];
    expect(callArg).toContain('npm:old-ext');
    expect(callArg.filter((s: string) => s === 'npm:already-there')).toHaveLength(1);
  });
});
