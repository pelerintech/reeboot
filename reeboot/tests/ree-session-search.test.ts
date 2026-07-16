/**
 * session_search in ree mode
 *
 * Verifies that session_search is available in ree mode and scoped
 * to the current chat's history.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI } from '../src/extensions/extension-api.js';

describe('ExtensionAPI — getCurrentChatId', () => {
  it('ReeExtensionAdapter exposes getCurrentChatId', async () => {
    const { ReeExtensionAdapter } = await import('../src/extensions/ree-adapter.js');
    const { ReeChat } = await import('../src/runtime/ree-chat.js');

    const context = { cwd: '/tmp', workspacePath: '/tmp', config: {}, ui: { select: async () => undefined, confirm: async () => false, input: async () => undefined, notify: () => {} }, hasUI: false };
    const chat = new ReeChat('test-chat', { maxHistory: 50, context, config: {} });

    const adapter = new ReeExtensionAdapter(chat);
    expect(typeof adapter.getCurrentChatId).toBe('function');
    expect(adapter.getCurrentChatId()).toBe('test-chat');
  });

  it('PiExtensionAdapter does not expose getCurrentChatId', async () => {
    const { PiExtensionAdapter } = await import('../src/extensions/pi-adapter.js');
    const mockSession = {} as any;
    const adapter = new PiExtensionAdapter(mockSession);

    expect((adapter as any).getCurrentChatId).toBeUndefined();
  });
});

describe('ree session_search extension', () => {
  it('getReeFactories includes session_search tool', async () => {
    const { getReeFactories } = await import('../src/extensions/loader.js');
    const { ConfigSchema } = await import('../src/config.js');
    const config = ConfigSchema.parse({ sdk: 'ree' });
    const factories = getReeFactories(config);

    // Find the session_search factory (5th factory)
    expect(factories.length).toBeGreaterThanOrEqual(5);

    // The last factory (capabilities) registers the tool set
    // session_search should be registered as a tool
    const { ReeExtensionAdapter } = await import('../src/extensions/ree-adapter.js');
    const { ReeChat } = await import('../src/runtime/ree-chat.js');

    const context = { cwd: '/tmp', workspacePath: '/tmp', config: {}, ui: { select: async () => undefined, confirm: async () => false, input: async () => undefined, notify: () => {} }, hasUI: false };
    const chat = new ReeChat('test-chat', { maxHistory: 50, context, config: {} });

    const adapter = new ReeExtensionAdapter(chat);

    // Run all factory functions against the adapter
    for (const factory of factories) {
      await factory(adapter);
    }

    // Check if session_search tool is registered
    const tools = adapter.getAllTools();
    const sessionSearch = tools.find((t) => t.name === 'session_search');
    expect(sessionSearch).toBeDefined();
    expect(sessionSearch?.name).toBe('session_search');
  });
});
