import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * YOLO mode tests.
 *
 * Verifies that when YOLO is active, dangerous (non-hardline) commands
 * are auto-approved, while hardline commands remain blocked.
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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('YOLO mode', () => {
  it('auto-approves dangerous commands when YOLO is active via config', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'deny', yolo: true } });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const result = await handler(
      { toolName: 'bash', input: { command: 'rm -rf ./node_modules' } },
      { hasUI: false },
    );
    expect(result).toBeUndefined(); // auto-approved by YOLO
  });

  it('still blocks hardline commands even when YOLO is active', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'deny', yolo: true } });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const result = await handler(
      { toolName: 'bash', input: { command: 'rm -rf /' } },
      { hasUI: false },
    );
    expect(result).toBeDefined();
    expect(result.block).toBe(true);
    expect(result.reason).toMatch(/permanently blocked/i);
  });

  it('auto-approves when YOLO is toggled via REBOOT_YOLO_MODE=1 env var', async () => {
    vi.stubEnv('REEBOOT_YOLO_MODE', '1');
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'deny', yolo: false } });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const result = await handler(
      { toolName: 'bash', input: { command: 'rm -rf ./node_modules' } },
      { hasUI: false },
    );
    expect(result).toBeUndefined(); // auto-approved by env var YOLO
  });

  it('normal mode behavior when YOLO is off', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'deny', yolo: false } });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const result = await handler(
      { toolName: 'bash', input: { command: 'rm -rf ./node_modules' } },
      { hasUI: false },
    );
    expect(result).toBeDefined();
    expect(result.block).toBe(true);
    // Not hardline — normal deny behavior
    expect(result.reason).not.toMatch(/permanently blocked/i);
  });

  it('safe commands are unaffected by YOLO', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'deny', yolo: true } });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const result = await handler(
      { toolName: 'bash', input: { command: 'ls -la' } },
      { hasUI: false },
    );
    expect(result).toBeUndefined();
  });

  it('non-bash tools are unaffected by YOLO', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'deny', yolo: true } });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const result = await handler(
      { toolName: 'read', input: { path: '/etc/passwd' } },
      { hasUI: false },
    );
    expect(result).toBeUndefined();
  });
});
