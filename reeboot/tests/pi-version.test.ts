/**
 * pi-version.test.ts
 *
 * Verifies that package.json pins @earendil-works/pi-coding-agent to exactly 0.74.0
 * and that the installed node_modules version matches.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..');

const pkg = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf-8'));
const installed = JSON.parse(
  readFileSync(
    resolve(PACKAGE_ROOT, 'node_modules/@earendil-works/pi-coding-agent/package.json'),
    'utf-8'
  )
);

describe('pi version', () => {
  it('package.json declares exact pin 0.74.0', () => {
    expect(pkg.dependencies['@earendil-works/pi-coding-agent']).toBe('0.74.0');
  });

  it('installed node_modules version is 0.74.0', () => {
    expect(installed.version).toBe('0.74.0');
  });
});
