/**
 * pi-version.test.ts
 *
 * Verifies that package.json pins @earendil-works/pi-coding-agent (and its
 * companions pi-ai / pi-agent-core) to exactly 1.0.2 and that the installed
 * node_modules versions match.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..');

const pkg = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf-8'));

const PI_PACKAGES = [
  '@earendil-works/pi-coding-agent',
  '@earendil-works/pi-ai',
  '@earendil-works/pi-agent-core',
];

function installedVersion(name: string): string {
  const p = JSON.parse(
    readFileSync(resolve(PACKAGE_ROOT, 'node_modules', name, 'package.json'), 'utf-8')
  );
  return p.version;
}

describe('pi version', () => {
  it('package.json declares exact pin 1.0.2 for all three pi packages', () => {
    for (const name of PI_PACKAGES) {
      expect(pkg.dependencies[name]).toBe('1.0.2');
    }
  });

  it('installed node_modules version is 1.0.2 for all three pi packages', () => {
    for (const name of PI_PACKAGES) {
      expect(installedVersion(name)).toBe('1.0.2');
    }
  });
});
