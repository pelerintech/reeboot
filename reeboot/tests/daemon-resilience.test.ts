/**
 * Daemon resilience tests — WR-4
 * Tests that the generated systemd unit uses Restart=always + burst protection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Mock execSync to prevent actually running systemctl
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock fs.writeFileSync to capture the written unit file content
let capturedUnitPath = '';
let capturedUnitContent = '';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    writeFileSync: vi.fn((path: string, content: string) => {
      if (String(path).endsWith('.service')) {
        capturedUnitPath = path;
        capturedUnitContent = content;
      }
      // Don't actually write
    }),
    mkdirSync: vi.fn(), // no-op
  };
});

describe('daemon systemd unit — Restart=always + burst protection', () => {
  const testSystemdDir = join(tmpdir(), 'reeboot-test-systemd');

  beforeEach(() => {
    capturedUnitPath = '';
    capturedUnitContent = '';
    vi.clearAllMocks();
  });

  it('generated unit contains Restart=always', async () => {
    const { startDaemon } = await import('@src/daemon.js');
    await startDaemon({
      platform: 'linux',
      reebotBin: '/usr/bin/reeboot',
      reebotDir: '/home/test/.reeboot',
      systemdDir: testSystemdDir,
    });

    expect(capturedUnitContent).toContain('Restart=always');
  });

  it('generated unit does NOT contain Restart=on-failure', async () => {
    const { startDaemon } = await import('@src/daemon.js');
    await startDaemon({
      platform: 'linux',
      reebotBin: '/usr/bin/reeboot',
      reebotDir: '/home/test/.reeboot',
      systemdDir: testSystemdDir,
    });

    expect(capturedUnitContent).not.toContain('Restart=on-failure');
  });

  it('generated unit contains StartLimitIntervalSec=120', async () => {
    const { startDaemon } = await import('@src/daemon.js');
    await startDaemon({
      platform: 'linux',
      reebotBin: '/usr/bin/reeboot',
      reebotDir: '/home/test/.reeboot',
      systemdDir: testSystemdDir,
    });

    expect(capturedUnitContent).toContain('StartLimitIntervalSec=120');
  });

  it('generated unit contains StartLimitBurst=5', async () => {
    const { startDaemon } = await import('@src/daemon.js');
    await startDaemon({
      platform: 'linux',
      reebotBin: '/usr/bin/reeboot',
      reebotDir: '/home/test/.reeboot',
      systemdDir: testSystemdDir,
    });

    expect(capturedUnitContent).toContain('StartLimitBurst=5');
  });
});
