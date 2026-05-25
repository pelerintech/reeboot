/**
 * Advisory Scanner
 *
 * Scans the project's package-lock.json against a curated catalog of
 * known-compromised npm packages (advisories.json).
 *
 * Uses semver range matching to determine if the installed version
 * falls within an advisory's affected range.
 */

import { readFileSync, existsSync } from 'fs';

export interface Advisory {
  id: string;
  package: string;
  version: string;  // semver range, e.g. ">=1.0.0 <2.0.0"
  description: string;
  remediation: string;
  date: string;
}

/**
 * Check if a version satisfies a semver range.
 * Simple implementation supporting >=, <, >, <=, = patterns.
 */
function satisfiesVersion(version: string, range: string): boolean {
  const parts = range.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return true;

  for (const part of parts) {
    const op = part.match(/^([<>=]+)/);
    if (!op) continue;
    const opStr = op[1];
    const targetVer = part.slice(opStr.length);

    if (!versionSatisfiesOp(version, opStr, targetVer)) {
      return false;
    }
  }

  // All constraints passed
  return parts.length > 0;
}

function versionSatisfiesOp(version: string, op: string, target: string): boolean {
  const cmp = compareVersions(version, target);
  switch (op) {
    case '>=': return cmp >= 0;
    case '>':  return cmp > 0;
    case '<=': return cmp <= 0;
    case '<':  return cmp < 0;
    case '=':  return cmp === 0;
    default:   return false;
  }
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Extract all installed packages and their versions from a package-lock.json.
 */
function extractPackages(lockfile: any): Map<string, string> {
  const packages = new Map<string, string>();

  // Lockfile v2+ has a "packages" object with "node_modules/<name>" keys
  const pkgs = lockfile?.packages ?? {};
  for (const [key, pkg] of Object.entries(pkgs)) {
    if (key === '') continue; // root package
    const name = extractPackageName(key);
    if (name && (pkg as any)?.version) {
      packages.set(name, (pkg as any).version);
    }
  }

  return packages;
}

function extractPackageName(key: string): string | null {
  // Strip 'node_modules/' prefix and any nested node_modules paths
  const parts = key.split('node_modules/');
  return parts[parts.length - 1] || null;
}

/**
 * Scan the lockfile for packages matching any advisory.
 */
export function scanDependencies(lockfilePath: string, advisoriesPath: string): Advisory[] {
  const results: Advisory[] = [];

  // Read advisories
  if (!existsSync(advisoriesPath)) return results;
  let advisories: Advisory[];
  try {
    advisories = JSON.parse(readFileSync(advisoriesPath, 'utf-8'));
    if (!Array.isArray(advisories)) return results;
  } catch {
    return results;
  }

  // Read lockfile
  if (!existsSync(lockfilePath)) return results;
  let lockfile: any;
  try {
    lockfile = JSON.parse(readFileSync(lockfilePath, 'utf-8'));
  } catch {
    return results;
  }

  const installed = extractPackages(lockfile);

  // Check each advisory against installed packages
  for (const advisory of advisories) {
    const installedVersion = installed.get(advisory.package);
    if (!installedVersion) continue;

    if (satisfiesVersion(installedVersion, advisory.version)) {
      results.push({
        ...advisory,
        version: installedVersion, // replace range with actual installed version
      });
    }
  }

  return results;
}