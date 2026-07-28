import { describe, it, expect, vi } from 'vitest';
import type { AgentRunner } from '@src/agent-runner/interface.js';

describe('Delegate tool — timeout', () => {
  // Helper to create a delegate extension and return the registered tool
  async function getDelegateTool(runnerFactory?: (task: string) => AgentRunner) {
    const { delegateExtension } = await import('@src/extensions/delegate.js');
    let registeredTool: any = null;
    const mockApi = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;
    delegateExtension(mockApi, { runnerFactory });
    return registeredTool;
  }

  it('returns error when timeout is exceeded', async () => {
    const tool = await getDelegateTool(() => ({
      prompt: vi.fn().mockImplementation(async (_content: string, _onEvent: any) => {
        // Simulate a hanging sub-agent (never calls onEvent)
        await new Promise(() => {}); // hang forever
      }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
    } as any));

    // 50ms timeout
    const start = Date.now();
    const result = await tool.execute('id', { task: 'Slow task', timeout: 0.05 }, null, null, {});
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000); // Should not hang for 2s
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('timed out');
  });

  it('completes normally before timeout', async () => {
    const tool = await getDelegateTool(() => ({
      prompt: vi.fn().mockImplementation(async (_content: string, onEvent: any) => {
        // Fast completion
        onEvent({ type: 'text_delta', delta: 'Quick result' });
        onEvent({ type: 'message_end', content: [{ type: 'text', text: 'Quick result' }] });
      }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
    } as any));

    const result = await tool.execute('id', { task: 'Fast task', timeout: 5 }, null, null, {});

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe('Quick result');
  });
});
