import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Bootstrap advisory scanning tests.
 *
 * Verifies that the advisory scanner runs during startup and logs
 * warnings when advisories are found.
 */

// Mock the advisory scanner
vi.mock('@src/security/advisory-scanner.js', () => ({
  scanDependencies: vi.fn(),
}));

// Mock the logger
const mockWarn = vi.fn();
const mockInfo = vi.fn();
vi.mock('@src/observability/logger.js', () => ({
  getLogger: vi.fn(() => ({
    warn: mockWarn,
    info: mockInfo,
    error: vi.fn(),
    child: vi.fn(() => ({ warn: mockWarn, info: mockInfo, error: vi.fn() })),
  })),
}));

describe('bootstrap — advisory scanning', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-bootstrap-test-'));
    mockWarn.mockReset();
    mockInfo.mockReset();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls scanDependencies during bootstrap and logs warnings when advisories found', async () => {
    const { scanDependencies } = await import('@src/security/advisory-scanner.js');

    // Mock scanDependencies to return an advisory
    (scanDependencies as any).mockReturnValue([
      {
        id: 'ADV-2026-001',
        package: 'compromised-lib',
        version: '1.2.3',
        description: 'Malicious package',
        remediation: 'Remove it',
        date: '2026-01-15',
      },
    ]);

    // Create a minimal package-lock for paths
    writeFileSync(join(tmpDir, 'package-lock.json'), JSON.stringify({ name: 'test', lockfileVersion: 3, packages: {} }));

    const { bootstrapServerJobs } = await import('@src/bootstrap.js');

    // Mock DB and scheduler
    const mockDb = {} as any;
    const mockScheduler = {} as any;

    bootstrapServerJobs(mockDb, mockScheduler, {});

    // scanDependencies should have been called (the bootstrap function runs it directly)
    expect(scanDependencies).toHaveBeenCalled();

    // Warning should have been logged
    expect(mockWarn).toHaveBeenCalled();
  });

  it('does not log warnings when no advisories found', async () => {
    const { scanDependencies } = await import('@src/security/advisory-scanner.js');
    (scanDependencies as any).mockReturnValue([]);

    const { bootstrapServerJobs } = await import('@src/bootstrap.js');

    const mockDb = {} as any;
    const mockScheduler = {} as any;

    mockWarn.mockReset();
    bootstrapServerJobs(mockDb, mockScheduler, {});

    // No warning for advisory content
    const advisoryWarnCalls = mockWarn.mock.calls.filter(
      (c: any[]) => c[0]?.component !== 'memory-manager' && c[0]?.component !== 'knowledge-manager'
    );
    expect(advisoryWarnCalls).toHaveLength(0);
  });
});