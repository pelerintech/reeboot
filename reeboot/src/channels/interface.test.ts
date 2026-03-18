/**
 * Channel Adapter Interface tests (task 1.1) — TDD red
 */

import { describe, it, expect } from 'vitest';

describe('ChannelAdapter interface types', () => {
  it('exports ChannelAdapter, MessageBus, ChannelConfig, ChannelStatus, MessageContent, IncomingMessage', async () => {
    // Will fail until interface.ts is created
    const mod = await import('./interface.js');
    expect(mod).toBeDefined();
  });

  it('ChannelStatus values are connected | disconnected | error | initializing', async () => {
    const { CHANNEL_STATUS_VALUES } = await import('./interface.js');
    expect(CHANNEL_STATUS_VALUES).toContain('connected');
    expect(CHANNEL_STATUS_VALUES).toContain('disconnected');
    expect(CHANNEL_STATUS_VALUES).toContain('error');
    expect(CHANNEL_STATUS_VALUES).toContain('initializing');
  });

  it('IncomingMessage shape has required fields', async () => {
    const { createIncomingMessage } = await import('./interface.js');
    const msg = createIncomingMessage({
      channelType: 'whatsapp',
      peerId: '1234@s.whatsapp.net',
      content: 'Hello',
      raw: {},
    });
    expect(msg.channelType).toBe('whatsapp');
    expect(msg.peerId).toBe('1234@s.whatsapp.net');
    expect(msg.content).toBe('Hello');
    expect(msg.timestamp).toBeTypeOf('number');
    expect(msg.raw).toBeDefined();
  });
});
