import { describe, it, expect, vi } from 'vitest';
import type { ChannelAdapter } from '@src/channels/interface.js';

function makeMockAdapter(): ChannelAdapter {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onMessage: vi.fn(),
  } as unknown as ChannelAdapter;
}

describe('broadcastToAllChannels', () => {
  it('sends text to all adapters', async () => {
    const { broadcastToAllChannels } = await import('@src/utils/broadcast.js');
    const a = makeMockAdapter();
    const b = makeMockAdapter();
    const adapters = new Map([['web', a], ['whatsapp', b]]);
    broadcastToAllChannels(adapters, 'hello');
    expect(a.send).toHaveBeenCalledWith('__system__', { type: 'text', text: 'hello' });
    expect(b.send).toHaveBeenCalledWith('__system__', { type: 'text', text: 'hello' });
  });

  it('continues sending to remaining adapters if one throws', async () => {
    const { broadcastToAllChannels } = await import('@src/utils/broadcast.js');
    const a = makeMockAdapter();
    const b = makeMockAdapter();
    (a.send as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
    const adapters = new Map([['web', a], ['whatsapp', b]]);
    // Should not throw
    expect(() => broadcastToAllChannels(adapters, 'hello')).not.toThrow();
    // b should still be called
    expect(b.send).toHaveBeenCalledWith('__system__', { type: 'text', text: 'hello' });
  });

  it('does not throw when adapters map is empty', async () => {
    const { broadcastToAllChannels } = await import('@src/utils/broadcast.js');
    expect(() => broadcastToAllChannels(new Map(), 'hello')).not.toThrow();
  });
});
