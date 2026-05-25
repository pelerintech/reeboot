import { describe, it, expect, vi } from 'vitest';

/**
 * Hardline blocklist tests.
 *
 * Verifies that catastrophic commands are blocked with a "permanently blocked"
 * reason, regardless of approval mode.
 */

// We need to import the confirm-destructive extension. It's a default export
// function that registers handlers on a mock ExtensionAPI.
async function importExtension() {
  const mod = await import('@src/extensions/confirm-destructive.js');
  return mod.default;
}

function createMockPi() {
  const handlers: Record<string, Function> = {};
  const mockPi = {
    on: vi.fn((event: string, handler: Function) => {
      handlers[event] = handler;
    }),
    _handlers: handlers,
  };
  return mockPi;
}

describe('hardline blocklist', () => {
  // Utility: invoke the tool_call handler and return its result
  async function checkCommand(command: string): Promise<{ block?: boolean; reason?: string } | undefined> {
    const mod = await import('@src/extensions/confirm-destructive.js');
    const mockPi = createMockPi();
    mod.default(mockPi);

    const handler = mockPi._handlers['tool_call'];
    if (!handler) throw new Error('Expected tool_call handler to be registered');

    return handler(
      { toolName: 'bash', input: { command } },
      { hasUI: false },
    );
  }

  it('blocks rm -rf /', async () => {
    const result = await checkCommand('rm -rf /');
    expect(result).toBeDefined();
    expect(result!.block).toBe(true);
    expect(result!.reason).toMatch(/permanently blocked/i);
  });

  it('blocks rm -rf --no-preserve-root /', async () => {
    const result = await checkCommand('rm -rf --no-preserve-root /');
    expect(result!.block).toBe(true);
    expect(result!.reason).toMatch(/permanently blocked/i);
  });

  it('blocks fork bomb', async () => {
    const result = await checkCommand(':(){ :|:& };:');
    expect(result!.block).toBe(true);
    expect(result!.reason).toMatch(/permanently blocked/i);
  });

  it('blocks dd if=/dev/zero of=/dev/sda', async () => {
    const result = await checkCommand('dd if=/dev/zero of=/dev/sda');
    expect(result!.block).toBe(true);
    expect(result!.reason).toMatch(/permanently blocked/i);
  });

  it('blocks overwriting /etc/passwd', async () => {
    const result = await checkCommand('echo hacker::0:0::/:/bin/sh > /etc/passwd');
    expect(result!.block).toBe(true);
    expect(result!.reason).toMatch(/permanently blocked/i);
  });

  it('blocks chmod 000 /', async () => {
    const result = await checkCommand('chmod 000 /');
    expect(result!.block).toBe(true);
    expect(result!.reason).toMatch(/permanently blocked/i);
  });

  it('normal dangerous commands are NOT blocked with hardline reason', async () => {
    // a dangerous but non-hardline command should NOT say "permanently blocked"
    const result = await checkCommand('rm -rf ./node_modules');
    if (result?.block) {
      expect(result.reason).not.toMatch(/permanently blocked/i);
    }
  });

  it('non-dangerous commands are not blocked', async () => {
    const result = await checkCommand('ls -la');
    expect(result).toBeUndefined();
  });
});