/**
 * Package system
 *
 * installPackage, uninstallPackage, listPackages, migratePackages.
 * Delegates to pi's DefaultPackageManager and SettingsManager so packages
 * are tracked in ~/.reeboot/agent/settings.json and discovered by the loader.
 */

import { DefaultPackageManager, SettingsManager, type PackageSource } from '@mariozechner/pi-coding-agent';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PackageOptions {
  /** Path to ~/.reeboot/agent/ (default: ~/.reeboot/agent) */
  agentDir?: string;
}

export interface InstalledPackage {
  spec: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDefaultAgentDir(): string {
  return join(homedir(), '.reeboot', 'agent');
}

function sourceToString(source: PackageSource): string {
  return typeof source === 'string' ? source : source.source;
}

function parseSpecName(spec: string): string {
  if (spec.startsWith('npm:')) {
    return spec.slice(4).split('@')[0];
  }
  if (spec.startsWith('git:')) {
    const path = spec.slice(4);
    return path.split('/').pop()?.replace('.git', '') ?? spec;
  }
  return spec.split('/').pop() ?? spec;
}

function buildManager(agentDir: string) {
  const settingsManager = SettingsManager.create(process.cwd(), agentDir);
  const pm = new DefaultPackageManager({ agentDir, settingsManager, cwd: process.cwd() });
  return { pm, settingsManager };
}

// ─── installPackage ───────────────────────────────────────────────────────────

export async function installPackage(
  spec: string,
  opts: PackageOptions = {}
): Promise<void> {
  const agentDir = opts.agentDir ?? getDefaultAgentDir();
  const { pm } = buildManager(agentDir);
  await pm.install(spec);
}

// ─── uninstallPackage ─────────────────────────────────────────────────────────

export async function uninstallPackage(
  name: string,
  opts: PackageOptions = {}
): Promise<void> {
  const agentDir = opts.agentDir ?? getDefaultAgentDir();
  const { pm } = buildManager(agentDir);
  await pm.remove(name);
}

// ─── listPackages ─────────────────────────────────────────────────────────────

export async function listPackages(
  opts: PackageOptions = {}
): Promise<InstalledPackage[]> {
  const agentDir = opts.agentDir ?? getDefaultAgentDir();
  const { settingsManager } = buildManager(agentDir);
  const packages = settingsManager.getPackages() ?? [];
  return packages.map((s) => {
    const spec = sourceToString(s);
    return { spec, name: parseSpecName(spec) };
  });
}

// ─── migratePackages ──────────────────────────────────────────────────────────

/**
 * One-time migration: move packages from legacy config.json (extensions.packages)
 * into ~/.reeboot/agent/settings.json via SettingsManager.
 * Called at server startup.
 */
export async function migratePackages(
  configPath: string,
  agentDir: string
): Promise<void> {
  let config: any;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return;
  }

  const legacyPackages: string[] = config.extensions?.packages;
  if (!Array.isArray(legacyPackages) || legacyPackages.length === 0) return;

  const settingsManager = SettingsManager.create(process.cwd(), agentDir);
  const existing = settingsManager.getPackages() ?? [];
  const existingStrings = existing.map(sourceToString);

  const toAdd = legacyPackages.filter((spec: string) => !existingStrings.includes(spec));
  if (toAdd.length > 0) {
    await settingsManager.setPackages([...existing, ...toAdd]);
  }

  // Remove from config.json
  delete config.extensions.packages;
  if (Object.keys(config.extensions).length === 0) delete config.extensions;
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
