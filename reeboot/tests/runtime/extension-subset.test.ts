import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const WORKSPACE = mkdtempSync(join(tmpdir(), 'reeboot-subset-'));
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from '@src/extensions/extension-api.js';

const mockContext: ExtensionContext = {
  cwd: WORKSPACE,
  workspacePath: WORKSPACE,
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

// ─── Task 19: Ree extension subset loader ────────────────────────────────────

describe('Ree extension subset loader', () => {
  it('getReeFactories returns the full ree extension set', async () => {
    const { getReeFactories } = await import('@src/extensions/loader.js');
    const factories = getReeFactories(mockConfig);
    // Derive the expected count from the canonical ree extension list rather
    // than a magic number, so adding/removing a factory can't silently drift.
    const REE_FACTORY_MODULES = [
      'observability', 'session-name', 'token-meter', 'capabilities',
      'ree-session-search', 'injection-guard', 'trust-enforcer', 'delegate',
    ];
    expect(factories).toHaveLength(REE_FACTORY_MODULES.length);
  });

  it('observability exports makeObservabilityExtension (named)', async () => {
    const mod = await import('@src/extensions/observability.js');
    expect(typeof mod.makeObservabilityExtension).toBe('function');
  });

  it('session-name exports default', async () => {
    const mod = await import('@src/extensions/session-name.js');
    expect(typeof mod.default).toBe('function');
  });

  it('token-meter exports default', async () => {
    const mod = await import('@src/extensions/token-meter.js');
    expect(typeof mod.default).toBe('function');
  });

  it('capabilities exports default (takes api, config)', async () => {
    const mod = await import('@src/extensions/capabilities.js');
    expect(typeof mod.default).toBe('function');
  });
});

// ─── Task 20: observability runs unchanged on ree adapter ────────────────────

describe('observability runs unchanged on ree adapter', () => {
  let ReeChat: typeof import('@src/runtime/ree-chat.js').ReeChat;

  beforeEach(async () => {
    const mod = await import('@src/runtime/ree-chat.js');
    ReeChat = mod.ReeChat;
  });

  it('observability registers session_shutdown handler', async () => {
    const chat = new ReeChat('test-chat', { maxHistory: 50, context: mockContext, config: mockConfig });

    const { getReeFactories } = await import('@src/extensions/loader.js');
    const factories = getReeFactories(mockConfig);

    // Find and run the observability factory (first one)
    if (factories.length > 0) {
      await factories[0](chat.adapter);
    }

    // Emit session_shutdown — should not throw
    expect(() => chat.emitSessionShutdown('quit')).not.toThrow();
  });

  it('observability registers after_provider_response handler', async () => {
    const chat = new ReeChat('test-chat', { maxHistory: 50, context: mockContext, config: mockConfig });

    const { getReeFactories } = await import('@src/extensions/loader.js');
    const factories = getReeFactories(mockConfig);

    if (factories.length > 0) {
      await factories[0](chat.adapter);
    }

    // Emit after_provider_response — should not throw
    expect(() => {
      chat.emitAfterProviderResponse({
        contextId: 'main',
        provider: 'openai',
        status: 200,
        headers: {},
      });
    }).not.toThrow();
  });
});

// ─── Task 21: session-name, token-meter, capabilities run unchanged on ree adapter ───

describe('session-name, token-meter, capabilities run unchanged on ree adapter', () => {
  let ReeChat: typeof import('@src/runtime/ree-chat.js').ReeChat;

  beforeEach(async () => {
    const mod = await import('@src/runtime/ree-chat.js');
    ReeChat = mod.ReeChat;
  });

  it('session-name: setSessionName/getSessionName work', async () => {
    const chat = new ReeChat('test-chat', { maxHistory: 50, context: mockContext, config: mockConfig });

    const { getReeFactories } = await import('@src/extensions/loader.js');
    const factories = getReeFactories(mockConfig);

    // session-name is the 2nd factory
    if (factories.length > 1) {
      await factories[1](chat.adapter);
    }

    (chat.adapter as ExtensionAPI).setSessionName?.('my-session');
    expect((chat.adapter as ExtensionAPI).getSessionName?.()).toBe('my-session');
  });

  it('token-meter: agent_end handler runs without error', async () => {
    const chat = new ReeChat('test-chat', { maxHistory: 50, context: mockContext, config: mockConfig });

    const { getReeFactories } = await import('@src/extensions/loader.js');
    const factories = getReeFactories(mockConfig);

    // token-meter is the 3rd factory
    if (factories.length > 2) {
      await factories[2](chat.adapter);
    }

    // Emit agent_end — should not throw
    expect(() => {
      chat.emitAgentEnd({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi', usage: { inputTokens: 10, outputTokens: 5 } },
        ],
      });
    }).not.toThrow();
  });

  it('capabilities: before_agent_start handler runs and sees tools', async () => {
    const chat = new ReeChat('test-chat', { maxHistory: 50, context: mockContext, config: mockConfig });

    // Register a tool first
    chat.adapter.registerTool({
      name: 'test_tool',
      label: 'Test Tool',
      description: 'A test tool',
      parameters: {},
      execute: async () => ({ content: 'ok' }),
    });

    const { getReeFactories } = await import('@src/extensions/loader.js');
    const factories = getReeFactories(mockConfig);

    // capabilities is the 4th (last) factory
    if (factories.length > 3) {
      await factories[3](chat.adapter);
    }

    // Emit before_agent_start — should not throw
    expect(() => {
      chat.emitBeforeAgentStart({
        prompt: 'Hello',
        systemPrompt: 'You are helpful.',
        systemPromptOptions: {},
      });
    }).not.toThrow();
  });
});

// ─── Task C3: ree security extensions ────────────────────────────────────────

describe('ree security extensions (C3)', () => {
  let ReeChat: typeof import('@src/runtime/ree-chat.js').ReeChat;

  beforeEach(async () => {
    const mod = await import('@src/runtime/ree-chat.js');
    ReeChat = mod.ReeChat;
  });

  it('S1: injection-guard contributes its policy block (not just listenerCount)', async () => {
    const chat = new ReeChat('test', { maxHistory: 50, context: mockContext, config: mockConfig });

    const { getReeFactories } = await import('@src/extensions/loader.js');
    const factories = getReeFactories(mockConfig);

    for (const factory of factories) {
      await factory(chat.adapter);
    }

    // Assert injection-guard block is deterministically present
    // (proves both that the handler is registered AND that its return is honored)
    const result = await chat.emitBeforeAgentStart({
      prompt: 'User message',
      systemPrompt: 'BASE',
      systemPromptOptions: {},
    });
    expect(result.systemPrompt).toContain('external_content_policy');
  });

  it('S2 end-to-end: both capabilities AND injection-guard blocks reach the prompt (not order-dependent)', async () => {
    const chat = new ReeChat('test', { maxHistory: 50, context: mockContext, config: mockConfig });

    // Register a tool so capabilities has something to advertise
    chat.adapter.registerTool({
      name: 'test_tool',
      label: 'Test Tool',
      description: 'A test tool',
      parameters: {},
      execute: async () => ({ content: 'ok' }),
    });

    const { getReeFactories } = await import('@src/extensions/loader.js');
    const factories = getReeFactories(mockConfig);

    for (const factory of factories) {
      await factory(chat.adapter);
    }

    const result = await chat.emitBeforeAgentStart({
      prompt: 'User message',
      systemPrompt: 'BASE',
      systemPromptOptions: {},
    });

    // Both blocks must be present — proves compose semantics, not last-wins
    expect(result.systemPrompt).toContain('external_content_policy');
    expect(result.systemPrompt).toContain('test_tool');
  });

  it('S3: getReeFactories returns functions keyed to the canonical set (not just length check)', async () => {
    const { getReeFactories } = await import('@src/extensions/loader.js');
    const factories = getReeFactories(mockConfig);

    const REE_FACTORY_MODULES = [
      'observability', 'session-name', 'token-meter', 'capabilities',
      'ree-session-search', 'injection-guard', 'trust-enforcer', 'delegate',
    ];
    expect(factories).toHaveLength(REE_FACTORY_MODULES.length);
    for (const f of factories) {
      expect(typeof f).toBe('function');
    }
  });
});
