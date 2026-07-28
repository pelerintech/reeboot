import { describe, it, expect, vi } from 'vitest';
import type { AgentRunner, RunnerEvent } from '@src/agent-runner/interface.js';

describe('Delegate tool — ree sub-agent session', () => {
  it('creates a ReeAgentRunner via factory and returns result', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    // Mock runner that simulates a ree sub-agent completing a task
    const mockRunner: AgentRunner = {
      prompt: vi.fn().mockImplementation(async (_content: string, onEvent: (e: RunnerEvent) => void) => {
        onEvent({ type: 'text_delta', delta: 'Ree result: Paris is the capital of France.' });
        onEvent({ type: 'message_end', runId: 'ree-run-1', usage: { input: 50, output: 10 } });
      }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    } as any;

    const factory = vi.fn().mockReturnValue(mockRunner);

    let registeredTool: any = null;
    const mockApi = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    delegateExtension(mockApi, { runnerFactory: factory });

    const result = await registeredTool.execute('id', { task: 'What is the capital of France?' }, null, null, {});

    expect(factory).toHaveBeenCalledWith('What is the capital of France?');
    expect(mockRunner.prompt).toHaveBeenCalledWith('What is the capital of France?', expect.any(Function));
    expect(result).toBeDefined();
    expect(result.content[0].text).toBe('Ree result: Paris is the capital of France.');
  });

  it('supports timeout for ree sub-agent', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    const mockRunner: AgentRunner = {
      prompt: vi.fn().mockImplementation(async (_content: string, _onEvent: (e: RunnerEvent) => void) => {
        await new Promise(() => {}); // hang forever
      }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
    } as any;

    let registeredTool: any = null;
    const mockApi = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    delegateExtension(mockApi, { runnerFactory: () => mockRunner });

    const result = await registeredTool.execute('id', { task: 'Slow ree task', timeout: 0.05 }, null, null, {});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('timed out');
  });
});
