import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));

vi.mock('@src/observability/logger.js', () => ({
  getLogger: () => ({ warn: mockWarn }),
}));

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-te-test-'));
  mockWarn.mockClear();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeMetaFile(trust: string) {
  const workspaceDir = join(tmpDir, 'contexts', 'main', 'workspace');
  mkdirSync(workspaceDir, { recursive: true });
  const metaPath = join(workspaceDir, '.reeboot_turn_meta.json');
  writeFileSync(metaPath, JSON.stringify({
    operationType: 'user_message',
    turnId: 'test-turn-id',
    trust,
  }));
}

async function loadTrustEnforcer(config: any, trust: string) {
  // Write meta file before loading
  writeMetaFile(trust);

  const mod = await import('@src/extensions/trust-enforcer.js');
  const handlers: Record<string, ((event: any, ctx: any) => any)[]> = {};
  const mockPi: any = {
    on: vi.fn((event: string, handler: any) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    registerTool: vi.fn(),
  };

  mod.makeTrustEnforcerExtension(mockPi, config);

  const ctx = { cwd: join(tmpDir, 'contexts', 'main', 'workspace') };

  return {
    handlers,
    ctx,
    async callToolCall(toolName: string) {
      const list = handlers.tool_call;
      if (!list || list.length === 0) return null;
      return list[0]({ toolName, input: {} }, ctx);
    },
  };
}

describe('trust-enforcer', () => {
  it('blocks disallowed tool for end-user session', async () => {
    const { callToolCall } = await loadTrustEnforcer(
      {
        contexts: [{ name: 'main', tools: { whitelist: ['web_search', 'fetch_url', 'knowledge_search'] } }],
        permissions: { violations: { log: true } },
      },
      'end-user',
    );

    const result = await callToolCall('bash');
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain('bash');
    expect(result?.reason).toContain('not available');
  });

  it('allows whitelisted tool for end-user session', async () => {
    const { callToolCall } = await loadTrustEnforcer(
      {
        contexts: [{ name: 'main', tools: { whitelist: ['web_search', 'fetch_url'] } }],
        permissions: { violations: { log: true } },
      },
      'end-user',
    );

    const result = await callToolCall('web_search');
    expect(result).toBeUndefined();
  });

  it('allows all tools when no whitelist configured', async () => {
    const { callToolCall } = await loadTrustEnforcer(
      {
        contexts: [],
        permissions: { violations: { log: true } },
      },
      'end-user',
    );

    const result = await callToolCall('bash');
    expect(result).toBeUndefined();
  });

  it('allows all tools when whitelist is empty', async () => {
    const { callToolCall } = await loadTrustEnforcer(
      {
        contexts: [{ name: 'main', tools: { whitelist: [] } }],
        permissions: { violations: { log: true } },
      },
      'end-user',
    );

    const result = await callToolCall('write');
    expect(result).toBeUndefined();
  });

  it('allows all tools for owner trust', async () => {
    const { callToolCall } = await loadTrustEnforcer(
      {
        contexts: [{ name: 'main', tools: { whitelist: ['web_search'] } }],
        permissions: { violations: { log: true } },
      },
      'owner',
    );

    const result = await callToolCall('bash');
    expect(result).toBeUndefined();
  });

  it('defaults to owner when meta file is absent', async () => {
    // No meta file written — should default to owner
    const mod = await import('@src/extensions/trust-enforcer.js');
    const handlers: Record<string, ((event: any, ctx: any) => any)[]> = {};
    const mockPi: any = {
      on: vi.fn((event: string, handler: any) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      }),
      registerTool: vi.fn(),
    };

    mod.makeTrustEnforcerExtension(mockPi, {
      contexts: [{ name: 'main', tools: { whitelist: ['web_search'] } }],
      permissions: { violations: { log: true } },
    });

    const ctx = { cwd: '/nonexistent/path' };
    const list = handlers.tool_call;
    const result = await list[0]({ toolName: 'bash', input: {} }, ctx);
    expect(result).toBeUndefined(); // owner → no block
  });

  // ── Violation logging ──────────────────────────────────────────────────

  it('logs violation when permissions.violations.log is true', async () => {
    const { callToolCall } = await loadTrustEnforcer(
      {
        contexts: [{ name: 'main', tools: { whitelist: ['web_search'] } }],
        permissions: { violations: { log: true } },
      },
      'end-user',
    );

    const result = await callToolCall('bash');
    expect(result?.block).toBe(true);

    // Verify logger.warn was called with trust-enforcer violation data
    expect(mockWarn).toHaveBeenCalledTimes(1);
    const callArg = mockWarn.mock.calls[0][0];
    expect(callArg.component).toBe('trust-enforcer');
    expect(callArg.event).toBe('trust_violation');
    expect(callArg.toolName).toBe('bash');
    expect(callArg.trust).toBe('end-user');
  });

  it('does not log violation when permissions.violations.log is false', async () => {
    const { callToolCall } = await loadTrustEnforcer(
      {
        contexts: [{ name: 'main', tools: { whitelist: ['web_search'] } }],
        permissions: { violations: { log: false } },
      },
      'end-user',
    );

    const result = await callToolCall('bash');
    expect(result?.block).toBe(true);

    // Verify logger.warn was NOT called
    expect(mockWarn).not.toHaveBeenCalled();
  });
});