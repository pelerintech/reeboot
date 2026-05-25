import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Advisory scanner tests.
 *
 * Verifies that scanDependencies() matches npm packages from a
 * package-lock.json against a curated advisories.json catalog.
 */

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-advisory-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('advisory scanner — scanDependencies', () => {
  async function getScanner() {
    const mod = await import('@src/security/advisory-scanner.js');
    return mod.scanDependencies;
  }

  it('flags known-compromised package from advisories.json', async () => {
    const scanDependencies = await getScanner();

    // Create package-lock.json with a compromised package
    const lockfile = {
      name: 'test',
      lockfileVersion: 3,
      packages: {
        'node_modules/compromised-lib': {
          version: '1.2.3',
        },
      },
    };
    const lockfilePath = join(tmpDir, 'package-lock.json');
    writeFileSync(lockfilePath, JSON.stringify(lockfile));

    // Create advisories.json with a matching advisory
    const advisories = [
      {
        id: 'ADV-2026-001',
        package: 'compromised-lib',
        version: '>=1.0.0 <2.0.0',
        description: 'This package contains malicious code that exfiltrates environment variables.',
        remediation: 'Upgrade to compromised-lib@2.0.0 or remove the package.',
        date: '2026-01-15',
      },
    ];
    const advisoriesPath = join(tmpDir, 'advisories.json');
    writeFileSync(advisoriesPath, JSON.stringify(advisories));

    const results = scanDependencies(lockfilePath, advisoriesPath);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('ADV-2026-001');
    expect(results[0].package).toBe('compromised-lib');
    expect(results[0].version).toBe('1.2.3');
    expect(results[0].description).toBeDefined();
    expect(results[0].remediation).toBeDefined();
    expect(results[0].date).toBe('2026-01-15');
  });

  it('returns empty array for safe packages', async () => {
    const scanDependencies = await getScanner();

    const lockfile = {
      name: 'test',
      lockfileVersion: 3,
      packages: {
        'node_modules/lodash': {
          version: '4.17.21',
        },
      },
    };
    const lockfilePath = join(tmpDir, 'package-lock.json');
    writeFileSync(lockfilePath, JSON.stringify(lockfile));

    const advisories = [
      {
        id: 'ADV-2026-001',
        package: 'compromised-lib',
        version: '>=1.0.0 <2.0.0',
        description: 'Malicious package.',
        remediation: 'Remove it.',
        date: '2026-01-15',
      },
    ];
    const advisoriesPath = join(tmpDir, 'advisories.json');
    writeFileSync(advisoriesPath, JSON.stringify(advisories));

    const results = scanDependencies(lockfilePath, advisoriesPath);
    expect(results).toHaveLength(0);
  });

  it('does not flag when version is outside advisory range', async () => {
    const scanDependencies = await getScanner();

    const lockfile = {
      name: 'test',
      lockfileVersion: 3,
      packages: {
        'node_modules/compromised-lib': {
          version: '2.0.0',
        },
      },
    };
    const lockfilePath = join(tmpDir, 'package-lock.json');
    writeFileSync(lockfilePath, JSON.stringify(lockfile));

    const advisories = [
      {
        id: 'ADV-2026-001',
        package: 'compromised-lib',
        version: '>=1.0.0 <2.0.0',
        description: 'Malicious.',
        remediation: 'Upgrade.',
        date: '2026-01-15',
      },
    ];
    const advisoriesPath = join(tmpDir, 'advisories.json');
    writeFileSync(advisoriesPath, JSON.stringify(advisories));

    const results = scanDependencies(lockfilePath, advisoriesPath);
    expect(results).toHaveLength(0);
  });

  it('returns empty array for empty lockfile', async () => {
    const scanDependencies = await getScanner();

    const lockfile = {
      name: 'test',
      lockfileVersion: 3,
      packages: {},
    };
    const lockfilePath = join(tmpDir, 'package-lock.json');
    writeFileSync(lockfilePath, JSON.stringify(lockfile));

    const advisoriesPath = join(tmpDir, 'advisories.json');
    writeFileSync(advisoriesPath, JSON.stringify([]));

    const results = scanDependencies(lockfilePath, advisoriesPath);
    expect(results).toHaveLength(0);
  });

  it('matches packages from lockfile v2 format', async () => {
    const scanDependencies = await getScanner();

    // Lockfile v2 format has "dependencies" with name→version mapping
    const lockfile = {
      name: 'test',
      lockfileVersion: 2,
      dependencies: {
        'compromised-lib': {
          version: '1.5.0',
        },
      },
      packages: {
        'node_modules/compromised-lib': {
          version: '1.5.0',
        },
      },
    };
    const lockfilePath = join(tmpDir, 'package-lock.json');
    writeFileSync(lockfilePath, JSON.stringify(lockfile));

    const advisories = [
      {
        id: 'ADV-2026-001',
        package: 'compromised-lib',
        version: '>=1.0.0 <2.0.0',
        description: 'Malicious.',
        remediation: 'Upgrade.',
        date: '2026-01-15',
      },
    ];
    const advisoriesPath = join(tmpDir, 'advisories.json');
    writeFileSync(advisoriesPath, JSON.stringify(advisories));

    const results = scanDependencies(lockfilePath, advisoriesPath);
    expect(results).toHaveLength(1);
    expect(results[0].version).toBe('1.5.0');
  });
});