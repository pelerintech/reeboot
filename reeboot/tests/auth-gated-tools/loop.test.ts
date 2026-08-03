import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock('@tanstack/ai', async (importOriginal) => {
  const actual = await (importOriginal as any)();
  return {
    ...actual,
    chat: vi.fn(function* (opts: any) {
      mocks.calls.push(opts);
      return;
    }),
  };
});

describe('agent loop filters tools by auth level', () => {
  it('passes only auth-level-visible tools into the TanStack chat call', async () => {
    const { ReeChat } = await import('@src/runtime/ree-chat.js');
    const { runReeAgentLoop } = await import('@src/runtime/ree-agent-loop.js');

    const context: any = {
      cwd: '/tmp/w',
      workspacePath: '/tmp/w',
      config: { agent: { model: { provider: 'openai' } } },
      ui: { select: async () => undefined, confirm: async () => false, input: async () => undefined, notify: () => {} },
      hasUI: false,
    };

    const chat = new ReeChat('c1', { maxHistory: 50, context, config: context.config });
    chat.adapter.registerTool({
      name: 'baseline_tool', label: 'b', description: 'b', parameters: {},
      execute: async () => ({ content: 'b' }),
    });
    chat.adapter.registerTool({
      name: 'customer_tool', label: 'c', description: 'c', parameters: {}, minAuthLevel: 'customer',
      execute: async () => ({ content: 'c' }),
    });
    chat.authLevel = 'anonymous';

    mocks.calls.length = 0;
    await runReeAgentLoop(chat, 'hello', () => {}, {} as any);
    expect(mocks.calls.length).toBeGreaterThan(0);
    const toolNames = (mocks.calls[0].tools ?? []).map((t: any) => t.name ?? t.__toolName);
    expect(toolNames).toContain('baseline_tool');
    expect(toolNames).not.toContain('customer_tool');
  });
});
