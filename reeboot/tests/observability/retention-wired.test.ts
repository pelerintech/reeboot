import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SERVER_SRC = resolve(__dirname, '../../src/server.ts');

describe('OB-1-E: pruneObservabilityData wired into server startup', () => {
  it('server.ts imports pruneObservabilityData', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toContain('pruneObservabilityData');
  });

  it('server.ts calls pruneObservabilityData at startup', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    // Must be a function call, not just an import
    expect(src).toMatch(/pruneObservabilityData\s*\(/);
  });

  // ─── E3: Periodic retention ─────────────────────────────────────────
  // NOTE: Full behavioral tests (fake-timer with startServer) cannot run in
  // isolation because startServer spawns a scheduler poll loop and channels
  // that keep the process alive. The source-string checks below verify the
  // pattern is structurally correct. A full integration test should be added
  // at the end-to-end level (e.g., in bootstrap.test.ts) where the server's
  // full lifecycle is managed by a dedicated test harness.

  it('E3-S1: retention timer is armed at startup', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toMatch(/_retentionTimer\s*=\s*setInterval/);
  });

  it('E3-S1: interval is overridable via REEBOOT_RETENTION_INTERVAL_MS', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toContain('REEBOOT_RETENTION_INTERVAL_MS');
  });

  it('E3-S3: timer is cleared in stopServer', () => {
    const src = readFileSync(SERVER_SRC, 'utf-8');
    expect(src).toMatch(/clearInterval\([^)]*_retentionTimer/);
  });
});
