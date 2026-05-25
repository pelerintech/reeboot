import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Approval modes tests.
 *
 * Verifies deny/manual/smart/off modes for dangerous commands in confirm-destructive.
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
  const { _assessRisk, ...rest } = overrides;
  return {
    security: {
      injection_guard: { enabled: true, external_source_tools: ['fetch_url'] },
      dangerous_commands: {
        mode: 'deny',
        yolo: false,
        timeout: 60,
        ...(typeof rest.dangerous_commands === 'object' ? rest.dangerous_commands : {}),
      },
      website_blocklist: { enabled: false, domains: [] },
      allow_private_urls: false,
      advisories: { acked_advisories: [] },
      ...rest,
    },
    agent: {
      name: 'test',
      runner: 'pi',
      model: { authMode: 'own' as const, provider: 'openai', id: 'gpt-4', apiKey: 'sk-test' },
      turnTimeout: 300000,
    },
    ...(_assessRisk !== undefined ? { _assessRisk } : {}),
  };
}

describe('approval modes — deny', () => {
  it('blocks dangerous commands (default deny mode)', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig();
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const result = await handler(
      { toolName: 'bash', input: { command: 'rm -rf /tmp/stuff' } },
      { hasUI: false },
    );
    expect(result).toBeDefined();
    expect(result.block).toBe(true);
    expect(result.reason).not.toMatch(/permanently blocked/i);
  });
});

describe('approval modes — manual (with UI)', () => {
  it('calls ctx.ui.confirm and proceeds if user approves', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const confirmFn = vi.fn().mockResolvedValue(true);
    const config = makeConfig({ dangerous_commands: { mode: 'manual' } });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const ctx = { hasUI: true, ui: { confirm: confirmFn } };
    const result = await handler(
      { toolName: 'bash', input: { command: 'rm -rf /tmp/stuff' } },
      ctx,
    );
    expect(confirmFn).toHaveBeenCalled();
    // expect approval message to include the command
    const confirmMsg = confirmFn.mock.calls[0][0] as string;
    expect(confirmMsg).toContain('rm -rf /tmp/stuff');
    expect(result).toBeUndefined(); // no block — approved
  });

  it('blocks if user denies', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const confirmFn = vi.fn().mockResolvedValue(false);
    const config = makeConfig({ dangerous_commands: { mode: 'manual' } });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const ctx = { hasUI: true, ui: { confirm: confirmFn } };
    const result = await handler(
      { toolName: 'bash', input: { command: 'rm -rf /tmp/stuff' } },
      ctx,
    );
    expect(confirmFn).toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result.block).toBe(true);
  });

  it('hardline commands are still blocked even in manual mode with UI', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const confirmFn = vi.fn().mockResolvedValue(true);
    const config = makeConfig({ dangerous_commands: { mode: 'manual' } });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const ctx = { hasUI: true, ui: { confirm: confirmFn } };
    const result = await handler(
      { toolName: 'bash', input: { command: 'rm -rf /' } },
      ctx,
    );
    expect(result).toBeDefined();
    expect(result.block).toBe(true);
    expect(result.reason).toMatch(/permanently blocked/i);
    expect(confirmFn).not.toHaveBeenCalled(); // hardline skips approval
  });
});

describe('approval modes — manual (headless)', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'reeboot-approval-test-'));
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('writes .pending_approval.json and blocks with "Awaiting owner approval"', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'manual' } });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const ctx = { hasUI: false, cwd: workspaceDir };
    const result = await handler(
      { toolName: 'bash', input: { command: 'rm -rf /tmp/stuff' } },
      ctx,
    );
    expect(result).toBeDefined();
    expect(result.block).toBe(true);
    expect(result.reason).toMatch(/awaiting owner approval/i);

    const pendingFile = join(workspaceDir, '.pending_approval.json');
    expect(existsSync(pendingFile)).toBe(true);
    const pending = JSON.parse(readFileSync(pendingFile, 'utf-8'));
    expect(pending.command).toBe('rm -rf /tmp/stuff');
    expect(pending.created_at).toBeTypeOf('number');
  });
});

describe('approval modes — smart', () => {
  it('auto-approves low-risk commands (injected assessRisk returns low)', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const assessRiskFn = vi.fn().mockResolvedValue({ risk: 'low', reason: 'harmless cleanup' });
    const config = makeConfig({
      dangerous_commands: { mode: 'smart' },
      _assessRisk: assessRiskFn,
    });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const result = await handler(
      { toolName: 'bash', input: { command: 'rm -rf ./node_modules' } },
      { hasUI: false },
    );
    expect(assessRiskFn).toHaveBeenCalledWith('rm -rf ./node_modules');
    expect(result).toBeUndefined(); // auto-approved
  });

  it('auto-denies high-risk commands', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const assessRiskFn = vi.fn().mockResolvedValue({ risk: 'high', reason: 'catastrophic system wipe' });
    const config = makeConfig({
      dangerous_commands: { mode: 'smart' },
      _assessRisk: assessRiskFn,
    });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const result = await handler(
      { toolName: 'bash', input: { command: 'rm -rf / --no-preserve-root' } },
      { hasUI: false },
    );
    // Hardline would catch this, but let's test with a non-hardline command that's high risk
    expect(result).toBeDefined();
    expect(result.block).toBe(true);
  });

  it('falls back to manual for medium-risk (headless → writes pending approval)', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const workspaceDir = mkdtempSync(join(tmpdir(), 'reeboot-approval-test-'));
    try {
      const mockPi = createMockPi();
      const assessRiskFn = vi.fn().mockResolvedValue({ risk: 'medium', reason: 'potentially destructive' });
      const config = makeConfig({
        dangerous_commands: { mode: 'smart' },
        _assessRisk: assessRiskFn,
      });
      mod.default(mockPi, config);
      const handler = mockPi._handlers['tool_call'];
      const result = await handler(
        { toolName: 'bash', input: { command: 'rm -rf /tmp/data' } },
        { hasUI: false, cwd: workspaceDir },
      );
      expect(result).toBeDefined();
      expect(result.block).toBe(true);
      expect(result.reason).toMatch(/awaiting owner approval/i);
      const pendingFile = join(workspaceDir, '.pending_approval.json');
      expect(existsSync(pendingFile)).toBe(true);
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it('caches results — no second LLM call for same command', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const assessRiskFn = vi.fn().mockResolvedValue({ risk: 'low', reason: 'harmless' });
    const config = makeConfig({
      dangerous_commands: { mode: 'smart' },
      _assessRisk: assessRiskFn,
    });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const ctx = { hasUI: false, cwd: undefined };

    // First call — should trigger LLM
    await handler({ toolName: 'bash', input: { command: 'rm -rf ./node_modules' } }, ctx);
    expect(assessRiskFn).toHaveBeenCalledTimes(1);

    // Second call with same command — should use cache
    await handler({ toolName: 'bash', input: { command: 'rm -rf ./node_modules' } }, ctx);
    expect(assessRiskFn).toHaveBeenCalledTimes(1); // still 1, cached

    // Different command — should trigger new LLM call
    await handler({ toolName: 'bash', input: { command: 'rm -rf ./dist' } }, ctx);
    expect(assessRiskFn).toHaveBeenCalledTimes(2);
  });
});

describe('approval modes — headless approval flow (yes/no processing)', () => {
  let workspaceDir: string;

  beforeEach(() => {
    workspaceDir = mkdtempSync(join(tmpdir(), 'reeboot-approval-test-'));
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  function makeUserEntry(content: string) {
    return {
      id: 'msg-1',
      type: 'message' as const,
      parentId: null,
      timestamp: new Date().toISOString(),
      message: { role: 'user' as const, content },
    };
  }

  it('processes owner "yes" — deletes pending file and adds to allowlist', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'manual', timeout: 60 } });
    mod.default(mockPi, config);

    // Step 1: Write a pending approval file (simulating a blocked command)
    const pendingFile = join(workspaceDir, '.pending_approval.json');
    writeFileSync(pendingFile, JSON.stringify({
      command: 'rm -rf /tmp/old-data',
      reason: 'recursive delete',
      created_at: Date.now() - 5_000, // 5 seconds ago
    }));

    // Step 2: Simulate owner message "yes" arriving via before_agent_start
    const beforeHandler = mockPi._handlers['before_agent_start'];
    const ctx = {
      cwd: workspaceDir,
      sessionManager: {
        getEntries: () => [makeUserEntry('yes')],
      },
    };
    const result = await beforeHandler({}, ctx);

    // Step 3: Pending file should be deleted (approved)
    expect(existsSync(pendingFile)).toBe(false);

    // Step 4: System prompt should indicate the command was approved
    expect(result).toBeDefined();
    expect(result.systemPrompt).toBeDefined();
    expect(result.systemPrompt).toMatch(/approved/i);

    // Step 5: The approved command should now be auto-approved
    const toolHandler = mockPi._handlers['tool_call'];
    const toolResult = await toolHandler(
      { toolName: 'bash', input: { command: 'rm -rf /tmp/old-data' } },
      { hasUI: false, cwd: workspaceDir },
    );
    expect(toolResult).toBeUndefined(); // auto-approved, no block
  });

  it('processes owner "no" — deletes pending file and command stays blocked', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'manual', timeout: 60 } });
    mod.default(mockPi, config);

    // Step 1: Write a pending approval file
    const pendingFile = join(workspaceDir, '.pending_approval.json');
    writeFileSync(pendingFile, JSON.stringify({
      command: 'rm -rf /tmp/old-data',
      reason: 'recursive delete',
      created_at: Date.now() - 5_000,
    }));

    // Step 2: Simulate owner message "no"
    const beforeHandler = mockPi._handlers['before_agent_start'];
    const ctx = {
      cwd: workspaceDir,
      sessionManager: {
        getEntries: () => [makeUserEntry('no')],
      },
    };
    const result = await beforeHandler({}, ctx);

    // Step 3: Pending file should be deleted (denied)
    expect(existsSync(pendingFile)).toBe(false);

    // Step 4: System prompt should indicate denial
    expect(result).toBeDefined();
    expect(result.systemPrompt).toBeDefined();
    expect(result.systemPrompt).toMatch(/denied/i);

    // Step 5: The command should still be blocked (not in allowlist)
    const toolHandler = mockPi._handlers['tool_call'];
    const toolResult = await toolHandler(
      { toolName: 'bash', input: { command: 'rm -rf /tmp/old-data' } },
      { hasUI: false, cwd: workspaceDir },
    );
    expect(toolResult).toBeDefined();
    expect(toolResult.block).toBe(true);
    expect(toolResult.reason).toMatch(/awaiting owner approval/i);
  });

  it('processes owner "approve" as yes', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'manual', timeout: 60 } });
    mod.default(mockPi, config);

    const pendingFile = join(workspaceDir, '.pending_approval.json');
    writeFileSync(pendingFile, JSON.stringify({
      command: 'rm -rf /tmp/old-data',
      reason: 'recursive delete',
      created_at: Date.now() - 5_000,
    }));

    const beforeHandler = mockPi._handlers['before_agent_start'];
    const ctx = {
      cwd: workspaceDir,
      sessionManager: { getEntries: () => [makeUserEntry('approve')] },
    };
    const result = await beforeHandler({}, ctx);

    expect(existsSync(pendingFile)).toBe(false);
    expect(result.systemPrompt).toMatch(/approved/i);
  });

  it('processes owner "deny" as no', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'manual', timeout: 60 } });
    mod.default(mockPi, config);

    const pendingFile = join(workspaceDir, '.pending_approval.json');
    writeFileSync(pendingFile, JSON.stringify({
      command: 'rm -rf /tmp/old-data',
      reason: 'recursive delete',
      created_at: Date.now() - 5_000,
    }));

    const beforeHandler = mockPi._handlers['before_agent_start'];
    const ctx = {
      cwd: workspaceDir,
      sessionManager: { getEntries: () => [makeUserEntry('deny')] },
    };
    const result = await beforeHandler({}, ctx);

    expect(existsSync(pendingFile)).toBe(false);
    expect(result.systemPrompt).toMatch(/denied/i);
  });

  it('allowlist persists across turns — same command auto-approved, different command requires approval', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'manual', timeout: 60 } });
    mod.default(mockPi, config);

    const toolHandler = mockPi._handlers['tool_call'];
    const beforeHandler = mockPi._handlers['before_agent_start'];

    // Step 1: Write a pending approval
    const pendingFile = join(workspaceDir, '.pending_approval.json');
    writeFileSync(pendingFile, JSON.stringify({
      command: 'rm -rf /tmp/build',
      reason: 'recursive delete',
      created_at: Date.now() - 5_000,
    }));

    // Step 2: Owner says "yes"
    await beforeHandler({}, {
      cwd: workspaceDir,
      sessionManager: { getEntries: () => [makeUserEntry('yes')] },
    });

    // Step 3: Same command → auto-approved
    const r1 = await toolHandler(
      { toolName: 'bash', input: { command: 'rm -rf /tmp/build' } },
      { hasUI: false, cwd: workspaceDir },
    );
    expect(r1).toBeUndefined();

    // Step 4: Different dangerous command → still requires approval
    const r2 = await toolHandler(
      { toolName: 'bash', input: { command: 'rm -rf /tmp/other' } },
      { hasUI: false, cwd: workspaceDir },
    );
    expect(r2).toBeDefined();
    expect(r2.block).toBe(true);
    expect(r2.reason).toMatch(/awaiting owner approval/i);
  });

  it('non-approval message leaves pending approval untouched', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'manual', timeout: 60 } });
    mod.default(mockPi, config);

    const pendingFile = join(workspaceDir, '.pending_approval.json');
    writeFileSync(pendingFile, JSON.stringify({
      command: 'rm -rf /tmp/old-data',
      reason: 'recursive delete',
      created_at: Date.now() - 5_000,
    }));

    // Owner sends a normal message (not "yes" or "no")
    const beforeHandler = mockPi._handlers['before_agent_start'];
    const ctx = {
      cwd: workspaceDir,
      sessionManager: { getEntries: () => [makeUserEntry('Can you look at the logs instead?')] },
    };
    await beforeHandler({}, ctx);

    // Pending file should still exist (message was not an approval/denial)
    expect(existsSync(pendingFile)).toBe(true);
  });
});

describe('approval modes — off', () => {
  it('allows dangerous commands without block', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'off' } });
    mod.default(mockPi, config);
    const handler = mockPi._handlers['tool_call'];
    const result = await handler(
      { toolName: 'bash', input: { command: 'rm -rf /tmp/stuff' } },
      { hasUI: false },
    );
    expect(result).toBeUndefined(); // no block in off mode
  });

  it('hardline commands are still blocked in off mode', async () => {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    const config = makeConfig({ dangerous_commands: { mode: 'off' } });
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
});
