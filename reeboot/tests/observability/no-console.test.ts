import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';

const SRC = resolve(__dirname, '../../src');

function consoleCallCount(filePath: string): number {
  const content = readFileSync(filePath, 'utf-8');
  // Match console.log, console.warn, console.error, console.info, console.debug
  const matches = content.match(/\bconsole\.(log|warn|error|info|debug)\s*\(/g);
  return matches ? matches.length : 0;
}

/**
 * Walk src/ recursively, collecting .ts files.
 * Excludes files with intentional user-facing console output:
 *   - wizard/ (interactive setup UI)
 *   - setup-wizard.ts (same)
 *   - skills-cli.ts (CLI print output)
 *   - index.ts (CLI entry point with user-facing logs)
 *   - daemon.ts (OS service management with user-facing output)
 */
function collectSourceFiles(dir: string): string[] {
  const excluded = new Set([
    resolve(SRC, 'wizard'),
    resolve(SRC, 'setup-wizard.ts'),
    resolve(SRC, 'skills-cli.ts'),
    resolve(SRC, 'index.ts'),
    resolve(SRC, 'daemon.ts'),
  ]);

  const files: string[] = [];
  function walk(d: string): void {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (excluded.has(full)) continue;
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        files.push(full);
      }
    }
  }
  walk(dir);
  return files;
}

describe('no console.* in orchestrator and server (Task 6)', () => {
  it('src/orchestrator.ts has 0 console.* calls', () => {
    const count = consoleCallCount(resolve(SRC, 'orchestrator.ts'));
    expect(count).toBe(0);
  });

  it('src/server.ts has 0 console.* calls', () => {
    const count = consoleCallCount(resolve(SRC, 'server.ts'));
    expect(count).toBe(0);
  });
});

describe('no console.* in all remaining src/ files (Task 7)', () => {
  it('all non-UI src/ files have 0 console.* calls', () => {
    const files = collectSourceFiles(SRC);
    const violations: string[] = [];
    for (const f of files) {
      const count = consoleCallCount(f);
      if (count > 0) {
        violations.push(`${relative(SRC, f)}: ${count} call(s)`);
      }
    }
    expect(violations).toEqual([]);
  });
});
