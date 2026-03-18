import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Package Scaffold', () => {
  it('should have bin.reeboot field pointing to CLI entry', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin.reeboot).toBeDefined();
    expect(typeof pkg.bin.reeboot).toBe('string');
  });

  it('should have type: "module" for ESM', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
    expect(pkg.type).toBe('module');
  });

  it('should have exports field with main entry', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));
    expect(pkg.exports).toBeDefined();
    expect(pkg.exports['.']).toBeDefined();
  });
});
