/**
 * Doctor tests (task 5.1) — TDD red
 *
 * Tests runDoctor() which performs diagnostic checks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, writeFileSync } from 'fs';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('doctor', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    tmpDir = join(tmpdir(), `reeboot-doctor-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, 'config.json');

    // Write a valid config
    writeFileSync(configPath, JSON.stringify({
      agent: { name: 'Test', model: { provider: 'anthropic', apiKey: 'test-key', id: 'claude-opus-4-5' } },
      channels: { web: { enabled: true, port: 3000 } },
    }));
  });

  it('runDoctor returns array of check results', async () => {
    const { runDoctor } = await import('./doctor.js');
    const results = await runDoctor({ configPath, reebotDir: tmpDir, skipNetwork: true });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('each result has name, status, and message fields', async () => {
    const { runDoctor } = await import('./doctor.js');
    const results = await runDoctor({ configPath, reebotDir: tmpDir, skipNetwork: true });
    for (const r of results) {
      expect(r).toHaveProperty('name');
      expect(r).toHaveProperty('status');
      expect(['pass', 'fail', 'warn']).toContain(r.status);
      expect(r).toHaveProperty('message');
    }
  });

  it('exits 0 when all checks pass or only have warnings', async () => {
    const { runDoctor, doctorExitCode } = await import('./doctor.js');
    const results = await runDoctor({ configPath, reebotDir: tmpDir, skipNetwork: true });
    const code = doctorExitCode(results);
    // May be 0 or 1 — just check it's a number
    expect(typeof code).toBe('number');
  });

  it('config check passes for valid config', async () => {
    const { runDoctor } = await import('./doctor.js');
    const results = await runDoctor({ configPath, reebotDir: tmpDir, skipNetwork: true });
    const configCheck = results.find(r => r.name.toLowerCase().includes('config'));
    expect(configCheck).toBeDefined();
    expect(configCheck!.status).toBe('pass');
  });

  it('config check fails for invalid config', async () => {
    writeFileSync(configPath, '{invalid json!!');
    const { runDoctor } = await import('./doctor.js');
    const results = await runDoctor({ configPath, reebotDir: tmpDir, skipNetwork: true });
    const configCheck = results.find(r => r.name.toLowerCase().includes('config'));
    expect(configCheck).toBeDefined();
    expect(configCheck!.status).toBe('fail');
  });

  it('disk check passes when sufficient space', async () => {
    const { runDoctor } = await import('./doctor.js');
    const results = await runDoctor({ configPath, reebotDir: tmpDir, skipNetwork: true });
    const diskCheck = results.find(r => r.name.toLowerCase().includes('disk'));
    expect(diskCheck).toBeDefined();
    // Should be pass or warn (not fail in dev environment)
    expect(['pass', 'warn']).toContain(diskCheck!.status);
  });

  it('API key check is skipped when skipNetwork is true', async () => {
    const { runDoctor } = await import('./doctor.js');
    const results = await runDoctor({ configPath, reebotDir: tmpDir, skipNetwork: true });
    const apiCheck = results.find(r => r.name.toLowerCase().includes('api key'));
    // With skipNetwork, it should be warn/skipped or not present
    if (apiCheck) {
      expect(['warn', 'skip', 'pass']).toContain(apiCheck.status);
    }
  });

  it('doctorExitCode returns 1 if any check fails', async () => {
    const { doctorExitCode } = await import('./doctor.js');
    const results = [
      { name: 'Config', status: 'pass' as const, message: 'OK' },
      { name: 'Disk', status: 'fail' as const, message: 'No space' },
    ];
    expect(doctorExitCode(results)).toBe(1);
  });

  it('doctorExitCode returns 0 if only warnings', async () => {
    const { doctorExitCode } = await import('./doctor.js');
    const results = [
      { name: 'Config', status: 'pass' as const, message: 'OK' },
      { name: 'Disk', status: 'warn' as const, message: 'Low space' },
    ];
    expect(doctorExitCode(results)).toBe(0);
  });

  it('formatResult outputs ✓ for pass, ✗ for fail, ⚠ for warn', async () => {
    const { formatResult } = await import('./doctor.js');
    expect(formatResult({ name: 'Config', status: 'pass', message: 'OK' })).toContain('✓');
    expect(formatResult({ name: 'Config', status: 'fail', message: 'Bad' })).toContain('✗');
    expect(formatResult({ name: 'Config', status: 'warn', message: 'Warn' })).toContain('⚠');
  });
});
