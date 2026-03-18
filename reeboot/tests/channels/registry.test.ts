/**
 * Channel Registry tests (task 2.1) — TDD red
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ChannelRegistry', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('registers and retrieves an adapter factory', async () => {
    const { ChannelRegistry } = await import('@src/channels/registry.js');
    const registry = new ChannelRegistry();
    const factory = () => ({ init: vi.fn(), start: vi.fn(), stop: vi.fn(), send: vi.fn(), status: vi.fn() } as any);
    registry.register('test', factory);
    expect(registry.get('test')).toBeDefined();
  });

  it('unregistered type returns undefined', async () => {
    const { ChannelRegistry } = await import('@src/channels/registry.js');
    const registry = new ChannelRegistry();
    expect(registry.get('telegram')).toBeUndefined();
  });

  it('built-in adapters available after import via registerChannel', async () => {
    const { globalRegistry, registerChannel } = await import('@src/channels/registry.js');
    const factory = () => ({} as any);
    registerChannel('test-builtin', factory);
    expect(globalRegistry.get('test-builtin')).toBeDefined();
  });

  it('initChannels starts only enabled adapters', async () => {
    const { ChannelRegistry } = await import('@src/channels/registry.js');
    const registry = new ChannelRegistry();

    const startA = vi.fn().mockResolvedValue(undefined);
    const startB = vi.fn().mockResolvedValue(undefined);
    const initA = vi.fn().mockResolvedValue(undefined);
    const initB = vi.fn().mockResolvedValue(undefined);

    registry.register('ch-a', () => ({ init: initA, start: startA, stop: vi.fn(), send: vi.fn(), status: () => 'disconnected' } as any));
    registry.register('ch-b', () => ({ init: initB, start: startB, stop: vi.fn(), send: vi.fn(), status: () => 'disconnected' } as any));

    const { MessageBus } = await import('@src/channels/interface.js');
    const bus = new MessageBus();

    const config = {
      channels: {
        'ch-a': { enabled: true },
        'ch-b': { enabled: false },
      },
    } as any;

    await registry.initChannels(config, bus);

    expect(initA).toHaveBeenCalled();
    expect(startA).toHaveBeenCalled();
    expect(initB).not.toHaveBeenCalled();
    expect(startB).not.toHaveBeenCalled();
  });

  it('load error for custom adapter does not crash — other channels start', async () => {
    const { ChannelRegistry } = await import('@src/channels/registry.js');
    const registry = new ChannelRegistry();

    const startGood = vi.fn().mockResolvedValue(undefined);
    const initGood = vi.fn().mockResolvedValue(undefined);
    registry.register('good', () => ({ init: initGood, start: startGood, stop: vi.fn(), send: vi.fn(), status: () => 'disconnected' } as any));

    const { MessageBus } = await import('@src/channels/interface.js');
    const bus = new MessageBus();

    const config = {
      channels: {
        // 'bad' has adapter path that does not exist
        bad: { enabled: true, adapter: '/nonexistent/path/to/adapter.ts' },
        good: { enabled: true },
      },
    } as any;

    // Should not throw
    await expect(registry.initChannels(config, bus)).resolves.toBeDefined();
    // good should still have started
    expect(startGood).toHaveBeenCalled();
  });

  it('initChannels returns map of running adapters', async () => {
    const { ChannelRegistry } = await import('@src/channels/registry.js');
    const registry = new ChannelRegistry();

    registry.register('ch-x', () => ({ init: vi.fn().mockResolvedValue(undefined), start: vi.fn().mockResolvedValue(undefined), stop: vi.fn(), send: vi.fn(), status: () => 'disconnected' } as any));

    const { MessageBus } = await import('@src/channels/interface.js');
    const bus = new MessageBus();

    const config = { channels: { 'ch-x': { enabled: true } } } as any;
    const result = await registry.initChannels(config, bus);
    expect(result.has('ch-x')).toBe(true);
  });
});
