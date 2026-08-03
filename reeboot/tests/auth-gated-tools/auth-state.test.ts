import { describe, it, expect } from 'vitest';
import { applyAuthLevel } from '@src/extensions/ree-adapter.js';

const context: any = {
  cwd: '/tmp/w',
  workspacePath: '/tmp/w',
  config: { agent: { model: { provider: 'openai' } } },
  ui: { select: async () => undefined, confirm: async () => false, input: async () => undefined, notify: () => {} },
  hasUI: false,
};

describe('reeboot-owned auth-state mechanism', () => {
  it('defaults to anonymous and setAuthState raises the level', async () => {
    const { ReeChat } = await import('@src/runtime/ree-chat.js');
    const chat = new ReeChat('auth-1', { maxHistory: 50, context, config: context.config });
    expect(chat.authLevel).toBe('anonymous');

    chat.adapter.setAuthState('customer');
    expect(chat.authLevel).toBe('customer');
    expect(chat.adapter.getAuthState()).toBe('customer');
  });

  it('a gated tool becomes visible once the level is raised', async () => {
    const { ReeChat } = await import('@src/runtime/ree-chat.js');
    const chat = new ReeChat('auth-2', { maxHistory: 50, context, config: context.config });
    chat.adapter.registerTool({
      name: 'customer_tool', label: 'c', description: 'c', parameters: {}, minAuthLevel: 'customer',
      execute: async () => ({ content: 'c' }),
    });

    const before = applyAuthLevel(chat.tools, chat.authLevel).map((t) => t.name);
    expect(before).not.toContain('customer_tool');

    chat.adapter.setAuthState('customer');
    const after = applyAuthLevel(chat.tools, chat.authLevel).map((t) => t.name);
    expect(after).toContain('customer_tool');
  });

  it('auth_establish command raises the level', async () => {
    const { ReeChat } = await import('@src/runtime/ree-chat.js');
    const chat = new ReeChat('auth-3', { maxHistory: 50, context, config: context.config });
    const cmd = chat.commands.get('auth_establish');
    expect(cmd).toBeDefined();

    (cmd?.handler as Function)('admin', context);
    expect(chat.authLevel).toBe('admin');
  });
});
