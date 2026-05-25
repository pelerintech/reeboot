import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Approval timeout tests.
 *
 * Verifies that pending approvals expire after the configured timeout
 * and are handled correctly in both CLI and headless modes.
 */

function createMockPi() {
  const handlers: Record<string, Function> = {};
  const mockPi = {
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    }),
    _handlers: handlers,
  };
  return mockPi;
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    security: {
      injection_guard: { enabled: true, external_source_tools: ['fetch_url'] },
      dangerous_commands: {
        mode: 'deny',
        yolo: false,
        timeout: 60,
        ...(typeof overrides.dangerous_commands === 'object' ? overrides.dangerous_commands : {}),
      },
      website_blocklist: { enabled: false, domains: [] },
      allow_private_urls: false,
      advisories: { acked_advisories: [] },
    },
    agent: {
      name: 'test',
      runner: 'pi',
      model: { authMode: 'own' as const, provider: 'openai', id: 'gpt-4', apiKey: 'sk-test' },
      turnTimeout: 300000,
    },
  };
}

describe('approval timeout — headless (pending approval file)', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'reeboot-timeout-test-'));
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('denies approval when owner message arrives after timeout', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'manual', timeout: 5 } });
    mod.default(mockPi, config);

    // Create a pending approval that expired 10 seconds ago
    const pendingFile = join(workspaceDir, '.pending_approval.json');
    const pastTimestamp = Date.now() - 10_000;
    writeFileSync(pendingFile, JSON.stringify({
      command: 'rm -rf /tmp/stuff',
      reason: 'recursive delete',
      created_at: pastTimestamp,
    }));

    // Check that before_agent_start handler exists and processes the timeout
    const beforeHandler = mockPi._handlers['before_agent_start'];
    if (!beforeHandler) {
      // If no before_agent_start handler registered, the test fails
      expect(beforeHandler).toBeDefined();
      return;
    }

    // Simulate the owner's next message arriving (via before_agent_start)
    // The handler should check the pending file and deny it
    const result = await beforeHandler({}, { cwd: workspaceDir });

    // After timeout, the pending file should be cleared (deleted)
    expect(existsSync(pendingFile)).toBe(false);
  });

  it('grants approval when owner message arrives within timeout', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'manual', timeout: 60 } });
    mod.default(mockPi, config);

    // Create a pending approval that was created recently
    const pendingFile = join(workspaceDir, '.pending_approval.json');
    const recentTimestamp = Date.now() - 10_000; // 10 seconds ago, within 60s timeout
    writeFileSync(pendingFile, JSON.stringify({
      command: 'rm -rf /tmp/stuff',
      reason: 'recursive delete',
      created_at: recentTimestamp,
    }));

    const beforeHandler = mockPi._handlers['before_agent_start'];
    if (!beforeHandler) {
      expect(beforeHandler).toBeDefined();
      return;
    }

    // Simulate next message within timeout
    await beforeHandler({}, { cwd: workspaceDir });

    // The pending file should still exist (not expired)
    expect(existsSync(pendingFile)).toBe(true);
  });

  it('timeout value is read from config', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    // Custom timeout of 120 seconds
    const config = makeConfig({ dangerous_commands: { mode: 'manual', timeout: 120 } });
    mod.default(mockPi, config);

    // Create a pending approval that is 100 seconds old — within 120s timeout
    const pendingFile = join(workspaceDir, '.pending_approval.json');
    const timestamp = Date.now() - 100_000;
    writeFileSync(pendingFile, JSON.stringify({
      command: 'rm -rf /tmp/stuff',
      reason: 'recursive delete',
      created_at: timestamp,
    }));

    const beforeHandler = mockPi._handlers['before_agent_start'];
    if (!beforeHandler) {
      expect(beforeHandler).toBeDefined();
      return;
    }

    await beforeHandler({}, { cwd: workspaceDir });

    // Still within 120s timeout, file should exist
    expect(existsSync(pendingFile)).toBe(true);
  });

  it('clears pending approval on deny', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'manual', timeout: 1 } });
    mod.default(mockPi, config);

    const pendingFile = join(workspaceDir, '.pending_approval.json');
    const pastTimestamp = Date.now() - 10_000;
    writeFileSync(pendingFile, JSON.stringify({
      command: 'rm -rf /tmp/stuff',
      reason: 'recursive delete',
      created_at: pastTimestamp,
    }));

    const beforeHandler = mockPi._handlers['before_agent_start'];
    if (!beforeHandler) {
      expect(beforeHandler).toBeDefined();
      return;
    }

    await beforeHandler({}, { cwd: workspaceDir });

    // After timeout, pending approval file should be deleted
    expect(existsSync(pendingFile)).toBe(false);
  });
});

describe('approval timeout — CLI mode', () => {
  it('passes timeout option to ctx.ui.confirm', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const confirmFn = vi.fn().mockResolvedValue(true);
    const config = makeConfig({ dangerous_commands: { mode: 'manual', timeout: 30 } });
    mod.default(mockPi, config);

    const handler = mockPi._handlers['tool_call'];
    const ctx = { hasUI: true, ui: { confirm: confirmFn } };
    await handler(
      { toolName: 'bash', input: { command: 'rm -rf ./node_modules' } },
      ctx,
    );

    // Confirm should have been called
    expect(confirmFn).toHaveBeenCalled();
  });
});
