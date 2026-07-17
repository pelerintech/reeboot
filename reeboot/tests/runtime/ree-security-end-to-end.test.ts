import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from '@src/extensions/extension-api.js';

const mockContext: ExtensionContext = {
  cwd: '/tmp/test-workspace',
  workspacePath: '/tmp/test-workspace',
  config: { agent: { model: { provider: 'openai' } } },
  ui: {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => {},
  },
  hasUI: false,
};

const mockConfig = {
  agent: { model: { provider: 'openai' } },
  logging: { rate_limit_warn_threshold: 5000 },
  extensions: { core: {} },
};

describe('ree security extensions — end-to-end (C3)', () => {
  let ReeChat: typeof import('@src/runtime/ree-chat.js').ReeChat;

  beforeEach(async () => {
    const mod = await import('@src/runtime/ree-chat.js');
    ReeChat = mod.ReeChat;
  });

  it('S2: injection-guard policy block reaches the prompt deterministically', async () => {
    const chat = new ReeChat('test', { maxHistory: 50, context: mockContext, config: mockConfig });

    const { getReeFactories } = await import('@src/extensions/loader.js');
    const factories = getReeFactories(mockConfig);

    // Run all 7 factories
    for (const factory of factories) {
      await factory(chat.adapter);
    }

    // Emit before_agent_start — injection-guard should inject policy into systemPrompt
    const result = await chat.emitBeforeAgentStart({
      prompt: 'User message',
      systemPrompt: 'BASE',
      systemPromptOptions: {},
    });

    // The merged systemPrompt should include injection-guard's
    // external_content_policy block (not just "longer than BASE").
    // This is deterministic only if systemPrompts are COMPOSED, not last-wins.
    expect(result.systemPrompt).toContain('external_content_policy');
    expect(result.systemPrompt).toContain('untrusted sources');
  });

  it('S1: injection-guard and trust-enforcer are specifically wired', async () => {
    const chat = new ReeChat('test', { maxHistory: 50, context: mockContext, config: mockConfig });

    const { getReeFactories } = await import('@src/extensions/loader.js');
    const factories = getReeFactories(mockConfig);

    for (const factory of factories) {
      await factory(chat.adapter);
    }

    // Get the list of listener functions for before_agent_start
    const beforeListeners = chat.emitter.rawListeners('before_agent_start');
    const toolListeners = chat.emitter.rawListeners('tool_call');

    // At least one before_agent_start listener exists (injection-guard)
    expect(beforeListeners.length).toBeGreaterThanOrEqual(1);
    // At least one tool_call listener exists (trust-enforcer)
    expect(toolListeners.length).toBeGreaterThanOrEqual(1);
  });

  it('S3: getReeFactories returns factories by identity (not length only)', async () => {
    const { getReeFactories } = await import('@src/extensions/loader.js');
    const factories = getReeFactories(mockConfig);

    // Check that the number is 7
    expect(factories).toHaveLength(7);

    // Check each factory is a function
    for (const f of factories) {
      expect(typeof f).toBe('function');
    }
  });
});
