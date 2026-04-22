/**
 * mcp-reload.test.ts
 *
 * Verifies that mcp-manager skips disconnectAll on session_shutdown with
 * reason "reload" and performs full teardown on "quit".
 */

import { describe, it, expect, vi } from 'vitest';

async function mountExtension() {
  const handlers: Record<string, Function> = {};

  const mockPi = {
    on: (event: string, handler: Function) => { handlers[event] = handler; },
    registerTool: vi.fn(),
  } as any;

  const disconnectAllSpy = vi.fn().mockResolvedValue(undefined);
  const mockPool = { disconnectAll: disconnectAllSpy } as any;

  const mockConfig = { mcp: { servers: [] } } as any;

  const mod = await import('../../src/extensions/mcp-manager.ts');
  mod.mcpManagerExtension(mockPi, mockConfig, mockPool);

  return { handlers, disconnectAllSpy };
}

describe('mcp-manager session_shutdown', () => {
  it('does NOT call disconnectAll when reason is "reload"', async () => {
    const { handlers, disconnectAllSpy } = await mountExtension();
    await handlers['session_shutdown']({ reason: 'reload' });
    expect(disconnectAllSpy).not.toHaveBeenCalled();
  });

  it('DOES call disconnectAll when reason is "quit"', async () => {
    const { handlers, disconnectAllSpy } = await mountExtension();
    await handlers['session_shutdown']({ reason: 'quit' });
    expect(disconnectAllSpy).toHaveBeenCalledOnce();
  });

  it('DOES call disconnectAll for any unexpected reason (safe default)', async () => {
    const { handlers, disconnectAllSpy } = await mountExtension();
    await handlers['session_shutdown']({ reason: 'fork' });
    expect(disconnectAllSpy).toHaveBeenCalledOnce();
  });
});
