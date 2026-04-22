/**
 * scheduler-reload.test.ts
 *
 * Verifies that scheduler-tool skips manager.clearAll() on session_shutdown
 * with reason "reload" and calls it on "quit".
 */

import { describe, it, expect, vi } from 'vitest';
import { TimerManager } from '../../src/extensions/scheduler-tool.ts';

async function mountExtension() {
  const handlers: Record<string, Function> = {};

  const mockPi = {
    on: (event: string, handler: Function) => { handlers[event] = handler; },
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
  } as any;

  const clearAllSpy = vi.spyOn(TimerManager.prototype, 'clearAll');

  const mod = await import('../../src/extensions/scheduler-tool.ts');
  mod.default(mockPi);

  return { handlers, clearAllSpy };
}

describe('scheduler-tool session_shutdown', () => {
  it('does NOT call clearAll when reason is "reload"', async () => {
    const { handlers, clearAllSpy } = await mountExtension();
    clearAllSpy.mockClear();
    handlers['session_shutdown']({ reason: 'reload' });
    expect(clearAllSpy).not.toHaveBeenCalled();
  });

  it('DOES call clearAll when reason is "quit"', async () => {
    const { handlers, clearAllSpy } = await mountExtension();
    clearAllSpy.mockClear();
    handlers['session_shutdown']({ reason: 'quit' });
    expect(clearAllSpy).toHaveBeenCalledOnce();
  });
});
