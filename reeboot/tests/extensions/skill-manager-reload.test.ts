/**
 * skill-manager-reload.test.ts
 *
 * Verifies that skill-manager skips clearInterval on session_shutdown with
 * reason "reload" and calls it on "quit".
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

async function mountExtension() {
  const handlers: Record<string, Function> = {};

  const mockPi = {
    on: (event: string, handler: Function) => { handlers[event] = handler; },
    registerTool: vi.fn(),
    registerCommand: vi.fn(),
  } as any;

  const mockConfig = {
    extensions: { core: { skill_manager: true } },
  } as any;

  vi.resetModules();
  const mod = await import('../../src/extensions/skill-manager.ts');
  await mod.default(mockPi, mockConfig);

  return { handlers };
}

describe('skill-manager session_shutdown', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does NOT call clearInterval when reason is "reload"', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { handlers } = await mountExtension();
    clearIntervalSpy.mockClear();
    await handlers['session_shutdown']({ reason: 'reload' });
    expect(clearIntervalSpy).not.toHaveBeenCalled();
  });

  it('DOES call clearInterval when reason is "quit"', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    const { handlers } = await mountExtension();
    clearIntervalSpy.mockClear();
    await handlers['session_shutdown']({ reason: 'quit' });
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
  });
});
