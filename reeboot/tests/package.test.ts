import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
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
  it('version is 1.0.0', () => {
    expect(pkg().version).toBe('1.0.0');
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
    expect(files).toContain('webchat/');
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

describe('npm pack dry-run', () => {
  it('only includes files from the whitelist', () => {
    const output = execSync('npm pack --dry-run 2>&1', {
      cwd: resolve(__dirname, '..'),
      encoding: 'utf-8',
    });

    const lines = output
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('dist/') || l.startsWith('extensions/') || l.startsWith('skills/') || l.startsWith('templates/') || l.startsWith('container/') || l === 'package.json' || l === 'README.md');

    // Check that src/ files are NOT included
    expect(output).not.toMatch(/\bsrc\//);
    // Check that test files are NOT included
    expect(output).not.toMatch(/\btests\//);
    // dist/ should be present (built output)
    expect(output).toMatch(/dist\//);
  });
});
