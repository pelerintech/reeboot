import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

function pkg() {
  return JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));
}

describe('Package Scaffold', () => {
  it('should have bin.reeboot field pointing to CLI entry', () => {
    expect(pkg().bin).toBeDefined();
    expect(pkg().bin.reeboot).toBeDefined();
    expect(typeof pkg().bin.reeboot).toBe('string');
  });

  it('should have type: "module" for ESM', () => {
    expect(pkg().type).toBe('module');
  });

  it('should have exports field with main entry', () => {
    expect(pkg().exports).toBeDefined();
    expect(pkg().exports['.']).toBeDefined();
  });
});

describe('Package Publication Readiness', () => {
  it('version is a valid semver string', () => {
    expect(pkg().version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('license is MIT', () => {
    expect(pkg().license).toBe('MIT');
  });

  it('engines.node is >=22', () => {
    expect(pkg().engines).toBeDefined();
    expect(pkg().engines.node).toBe('>=22');
  });

  it('files whitelist is correct', () => {
    const files = pkg().files;
    expect(files).toBeDefined();
    expect(files).toContain('dist/');
    expect(files).toContain('extensions/');
    expect(files).toContain('skills/');
    expect(files).toContain('templates/');
    expect(files).toContain('container/');
    expect(files).toContain('webchat/dist/');
  });

  it('exports has . and ./channels entries', () => {
    const exports = pkg().exports;
    expect(exports['.']).toBeDefined();
    expect(exports['./channels']).toBeDefined();
  });

  it('exports["."] points to dist/index.js', () => {
    const main = pkg().exports['.'];
    // supports both string and condition-object form
    const resolved = typeof main === 'string' ? main : main.import ?? main.default;
    expect(resolved).toBe('./dist/index.js');
  });

  it('exports["./channels"] points to dist/channels/interface.js', () => {
    const ch = pkg().exports['./channels'];
    const resolved = typeof ch === 'string' ? ch : ch.import ?? ch.default;
    expect(resolved).toBe('./dist/channels/interface.js');
  });

  it('bin.reeboot points to ./dist/index.js', () => {
    expect(pkg().bin.reeboot).toBe('./dist/index.js');
  });

  it('keywords include ai, agent, llm', () => {
    const kw: string[] = pkg().keywords ?? [];
    expect(kw).toContain('ai');
    expect(kw).toContain('agent');
    expect(kw).toContain('llm');
  });
});

describe('package files whitelist (in-process)', () => {
  const ROOT = resolve(__dirname, '..');

  it('every whitelist entry exists in the real repo layout', () => {
    const root = ROOT;
    const files = pkg().files;
    expect(Array.isArray(files)).toBe(true);

    // Source-layout entries must exist on disk.
    const entries = ['dist/', 'extensions/', 'skills/', 'templates/', 'container/'];
    for (const entry of entries) {
      expect(files).toContain(entry);
      expect(existsSync(join(root, entry))).toBe(true);
    }

    // webchat/dist is a publish-time build artifact: it is gitignored, never
    // committed, and produced by the separate webchat Vite build (not by the
    // root `tsc` build or CI). It therefore must NOT be required to exist on
    // disk in a fresh source checkout — only to remain in the publish whitelist.
    expect(files).toContain('webchat/dist/');
  });

  it('whitelist excludes src/, tests/ and node_modules', () => {
    const files: string[] = pkg().files ?? [];
    const isForbidden = (f: string) =>
      f.startsWith('src/') || f === 'src' ||
      f.startsWith('tests/') || f === 'tests' ||
      f.startsWith('__tests__/') || f === '__tests__' ||
      f.includes('node_modules');
    expect(files.some(isForbidden)).toBe(false);
  });
});
