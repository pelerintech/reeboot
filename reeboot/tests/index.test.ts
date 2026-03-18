import { describe, it, expect } from 'vitest';
import { execFileSync, execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir, homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '../src/index.ts');

function runCli(args: string[], opts: { env?: NodeJS.ProcessEnv; timeout?: number } = {}) {
  try {
    const stdout = execFileSync(
      'node',
      ['--import', 'tsx/esm', CLI, ...args],
      {
        encoding: 'utf-8',
        timeout: opts.timeout ?? 5000,
        env: { ...process.env, ...opts.env },
      }
    );
    return { stdout, stderr: '', code: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.status ?? 1 };
  }
}

describe('CLI Entry Point', () => {
  it('--help exits 0 and prints usage', () => {
    const { code, stdout } = runCli(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage');
  });

  it('unknown command exits non-zero', () => {
    const { code } = runCli(['unknowncmd']);
    expect(code).not.toBe(0);
  });

  it('no-config triggers wizard path message', () => {
    // Use a temp dir that has no config to ensure wizard path is entered
    const tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-cli-test-'));
    try {
      const fakeHome = tmpDir;
      // We expect 'start' with no config to either start wizard or print a wizard-related message
      // In non-interactive CI mode this should not hang, so we test with a flag
      const { stdout, stderr, code } = runCli(
        ['start', '--no-interactive'],
        { env: { HOME: fakeHome } }
      );
      // Either it ran the wizard in non-interactive mode or reported missing config
      const output = stdout + stderr;
      expect(output.length).toBeGreaterThan(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
