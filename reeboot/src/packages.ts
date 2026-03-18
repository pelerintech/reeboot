/**
 * Package system
 *
 * installPackage, uninstallPackage, listPackages.
 * Packages are installed to ~/.reeboot/packages/ via npm.
 * Identifiers are stored in config.extensions.packages[].
 */

import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PackageOptions {
  /** Path to config.json (default: ~/.reeboot/config.json) */
  configPath?: string;
  /** Reeboot home dir (default: ~/.reeboot) */
  reebotDir?: string;
}

export interface InstalledPackage {
  spec: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDefaultReebotDir(): string {
  return join(homedir(), '.reeboot');
}

function getDefaultConfigPath(reebotDir: string): string {
  return join(reebotDir, 'config.json');
}

function readConfig(configPath: string): any {
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfig(configPath: string, config: any): void {
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Convert a spec string (npm:name, git:..., /local/path) to the package name
 * and the npm install argument.
 */
function parseSpec(spec: string): { name: string; npmArg: string } {
  if (spec.startsWith('npm:')) {
    const pkgWithVersion = spec.slice(4);
    const name = pkgWithVersion.split('@')[0];
    return { name, npmArg: pkgWithVersion };
  }
  if (spec.startsWith('git:')) {
    // git:github.com/user/repo → github:user/repo
    const path = spec.slice(4);
    const parts = path.split('/');
    if (parts[0].includes('github.com')) {
      const npmArg = `github:${parts.slice(1).join('/')}`;
      const name = parts[parts.length - 1].replace('.git', '');
      return { name, npmArg };
    }
    // Generic git URL
    return { name: spec, npmArg: spec.slice(4) };
  }
  // Local path
  const name = spec.split('/').pop() ?? spec;
  return { name, npmArg: spec };
}

// ─── installPackage ───────────────────────────────────────────────────────────

export async function installPackage(
  spec: string,
  opts: PackageOptions = {}
): Promise<void> {
  const reebotDir = opts.reebotDir ?? getDefaultReebotDir();
  const configPath = opts.configPath ?? getDefaultConfigPath(reebotDir);
  const packagesDir = join(reebotDir, 'packages');

  mkdirSync(packagesDir, { recursive: true });

  const { name, npmArg } = parseSpec(spec);

  // Run npm install
  const result = spawnSync(
    'npm',
    ['install', '--prefix', packagesDir, npmArg],
    { stdio: 'inherit' }
  );

  if (result.status !== 0) {
    throw new Error(`npm install failed for ${spec} (exit code ${result.status})`);
  }

  // Update config
  const config = readConfig(configPath);
  if (!config.extensions) config.extensions = {};
  if (!Array.isArray(config.extensions.packages)) config.extensions.packages = [];

  // Avoid duplicates
  if (!config.extensions.packages.includes(spec)) {
    config.extensions.packages.push(spec);
  }

  saveConfig(configPath, config);
}

// ─── uninstallPackage ─────────────────────────────────────────────────────────

export async function uninstallPackage(
  name: string,
  opts: PackageOptions = {}
): Promise<void> {
  const reebotDir = opts.reebotDir ?? getDefaultReebotDir();
  const configPath = opts.configPath ?? getDefaultConfigPath(reebotDir);
  const packagesDir = join(reebotDir, 'packages');

  // Find the spec in config
  const config = readConfig(configPath);
  const packages: string[] = config.extensions?.packages ?? [];

  // Find matching spec (could be npm:name, git:..., or just name)
  const matchingSpec = packages.find((spec: string) => {
    const { name: specName } = parseSpec(spec);
    return specName === name || spec === name;
  });

  if (!matchingSpec) {
    throw new Error(`Package not installed: ${name}`);
  }

  // Run npm uninstall
  const result = spawnSync(
    'npm',
    ['uninstall', '--prefix', packagesDir, name],
    { stdio: 'inherit' }
  );

  if (result.status !== 0) {
    throw new Error(`npm uninstall failed for ${name} (exit code ${result.status})`);
  }

  // Update config
  config.extensions.packages = packages.filter((spec: string) => spec !== matchingSpec);
  saveConfig(configPath, config);
}

// ─── listPackages ─────────────────────────────────────────────────────────────

export async function listPackages(
  opts: PackageOptions = {}
): Promise<InstalledPackage[]> {
  const reebotDir = opts.reebotDir ?? getDefaultReebotDir();
  const configPath = opts.configPath ?? getDefaultConfigPath(reebotDir);

  const config = readConfig(configPath);
  const packages: string[] = config.extensions?.packages ?? [];

  return packages.map((spec: string) => {
    const { name } = parseSpec(spec);
    return { spec, name };
  });
}
