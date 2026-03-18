import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Task 1.1: Interface types importable, factory tests ─────────────────────

describe('AgentRunner interfaces (1.1)', () => {
  it('AgentRunner and related types are importable from agent-runner module', async () => {
    // This will fail until interface.ts exists
    const mod = await import('@src/agent-runner/interface.js');
    expect(mod).toBeDefined();
    // Types themselves are not runtime values — just verifying the module loads cleanly
  });
});

describe('createRunner factory (1.1)', () => {
  it('"pi" runner config creates a runner without throwing', async () => {
    const { createRunner } = await import('@src/agent-runner/index.js');
    const { defaultConfig } = await import('@src/config.js');
    const config = {
      ...defaultConfig,
      agent: { ...defaultConfig.agent, runner: 'pi' as const, model: defaultConfig.agent.model },
    };
    // We only test that the factory doesn't throw for a valid type
    // (actual pi session creation may fail without API keys — that's OK for unit tests)
    expect(() => createRunner({ id: 'main', workspacePath: '/tmp/test-ctx' }, config)).not.toThrow();
  });

  it('unknown runner value throws descriptive error', async () => {
    const { createRunner } = await import('@src/agent-runner/index.js');
    const { defaultConfig } = await import('@src/config.js');
    const config = { ...defaultConfig, agent: { ...defaultConfig.agent, runner: 'unknown' as any } };
    expect(() => createRunner({ id: 'main', workspacePath: '/tmp/test-ctx' }, config)).toThrow(
      'Unknown agent runner: unknown',
    );
  });
});

// ─── Task 1.3: PiAgentRunner tests ───────────────────────────────────────────

describe('PiAgentRunner (1.3)', () => {
  it('dispose() is idempotent — calling twice does not throw', async () => {
    const { PiAgentRunner } = await import('@src/agent-runner/pi-runner.js');
    const mockLoader = { reload: vi.fn(), getExtensions: vi.fn(() => ({ extensions: [], errors: [], runtime: {} })), getSkills: vi.fn(() => ({ skills: [], diagnostics: [] })), getPrompts: vi.fn(() => ({ prompts: [], diagnostics: [] })), getThemes: vi.fn(() => ({ themes: [], diagnostics: [] })), getAgentsFiles: vi.fn(() => ({ agentsFiles: [] })), getSystemPrompt: vi.fn(() => undefined), getAppendSystemPrompt: vi.fn(() => []), getPathMetadata: vi.fn(() => new Map()), extendResources: vi.fn() };
    const runner = new PiAgentRunner({ id: 'main', workspacePath: '/tmp' }, mockLoader as any);
    await runner.dispose();
    await expect(runner.dispose()).resolves.toBeUndefined();
  });

  it('reload() triggers loader.reload()', async () => {
    const { PiAgentRunner } = await import('@src/agent-runner/pi-runner.js');
    const mockLoader = { reload: vi.fn().mockResolvedValue(undefined), getExtensions: vi.fn(() => ({ extensions: [], errors: [], runtime: {} })), getSkills: vi.fn(() => ({ skills: [], diagnostics: [] })), getPrompts: vi.fn(() => ({ prompts: [], diagnostics: [] })), getThemes: vi.fn(() => ({ themes: [], diagnostics: [] })), getAgentsFiles: vi.fn(() => ({ agentsFiles: [] })), getSystemPrompt: vi.fn(() => undefined), getAppendSystemPrompt: vi.fn(() => []), getPathMetadata: vi.fn(() => new Map()), extendResources: vi.fn() };
    const runner = new PiAgentRunner({ id: 'main', workspacePath: '/tmp' }, mockLoader as any);
    await runner.reload();
    expect(mockLoader.reload).toHaveBeenCalledTimes(1);
  });

  it('abort() before any prompt does not throw', async () => {
    const { PiAgentRunner } = await import('@src/agent-runner/pi-runner.js');
    const mockLoader = { reload: vi.fn(), getExtensions: vi.fn(() => ({ extensions: [], errors: [], runtime: {} })), getSkills: vi.fn(() => ({ skills: [], diagnostics: [] })), getPrompts: vi.fn(() => ({ prompts: [], diagnostics: [] })), getThemes: vi.fn(() => ({ themes: [], diagnostics: [] })), getAgentsFiles: vi.fn(() => ({ agentsFiles: [] })), getSystemPrompt: vi.fn(() => undefined), getAppendSystemPrompt: vi.fn(() => []), getPathMetadata: vi.fn(() => new Map()), extendResources: vi.fn() };
    const runner = new PiAgentRunner({ id: 'main', workspacePath: '/tmp' }, mockLoader as any);
    expect(() => runner.abort()).not.toThrow();
  });
});
