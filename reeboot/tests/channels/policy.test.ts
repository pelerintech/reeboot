/**
 * ChannelPolicyLayer tests
 *
 * Tests owner identity resolution (Mode 1 + Mode 2), owner_only gating,
 * __system__ resolution, and lifecycle delegation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChannelAdapter, ChannelConfig, MessageBus, MessageContent, ChannelStatus } from '@src/channels/interface.js';
import { MessageBus as RealMessageBus, createIncomingMessage } from '@src/channels/interface.js';

// ─── Mock inner adapter ───────────────────────────────────────────────────────

class MockInnerAdapter implements ChannelAdapter {
  private _status: ChannelStatus = 'disconnected';
  private _bus: MessageBus | null = null;
  public sentTo: Array<{ peerId: string; content: MessageContent }> = [];
  public _selfAddr: string | null = null;

  async init(_config: ChannelConfig, bus: MessageBus): Promise<void> {
    this._bus = bus;
    this._status = 'initializing';
  }
  async start(): Promise<void> { this._status = 'connected'; }
  async stop(): Promise<void> { this._status = 'disconnected'; }
  async send(peerId: string, content: MessageContent): Promise<void> {
    this.sentTo.push({ peerId, content });
  }
  status(): ChannelStatus { return this._status; }
  connectedAt(): string | null { return null; }
  selfAddress(): string | null { return this._selfAddr; }

  /** Test helper: publish a message as if received from transport */
  inject(msg: { peerId: string; text: string; fromSelf?: boolean }): void {
    this._bus?.publish(createIncomingMessage({
      channelType: 'test',
      peerId: msg.peerId,
      content: msg.text,
      raw: {},
      fromSelf: msg.fromSelf,
    }));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makePolicy(config: Record<string, unknown>) {
  const { ChannelPolicyLayer } = await import('@src/channels/policy.js');
  const inner = new MockInnerAdapter();
  const bus = new RealMessageBus();
  const received: any[] = [];
  bus.onMessage((m) => received.push(m));
  const policy = new ChannelPolicyLayer(inner);
  await policy.init({ enabled: true, ...config } as ChannelConfig, bus);
  return { policy, inner, bus, received };
}

// ─── Mode 1: self-chat (no owner_id) ─────────────────────────────────────────

describe('ChannelPolicyLayer — Mode 1 (self-chat, no owner_id)', () => {
  it('fromSelf=true message passes through when owner_only is true', async () => {
    const { inner, received } = await makePolicy({ owner_only: true });
    inner.inject({ peerId: 'me@s.whatsapp.net', text: 'hello', fromSelf: true });
    expect(received).toHaveLength(1);
  });

  it('fromSelf=false message is dropped when owner_only is true', async () => {
    const { inner, received } = await makePolicy({ owner_only: true });
    inner.inject({ peerId: 'stranger@s.whatsapp.net', text: 'spam', fromSelf: false });
    expect(received).toHaveLength(0);
  });

  it('fromSelf=false message passes when owner_only is false', async () => {
    const { inner, received } = await makePolicy({ owner_only: false });
    inner.inject({ peerId: 'stranger@s.whatsapp.net', text: 'hi', fromSelf: false });
    expect(received).toHaveLength(1);
  });
});

// ─── Mode 2: dedicated account (owner_id present) ────────────────────────────

describe('ChannelPolicyLayer — Mode 2 (dedicated account, owner_id set)', () => {
  it('message from owner_id passes through when owner_only is true', async () => {
    const { inner, received } = await makePolicy({ owner_id: '+40700000001', owner_only: true });
    inner.inject({ peerId: '+40700000001', text: 'from owner', fromSelf: false });
    expect(received).toHaveLength(1);
  });

  it('message from non-owner is dropped when owner_only is true', async () => {
    const { inner, received } = await makePolicy({ owner_id: '+40700000001', owner_only: true });
    inner.inject({ peerId: '+40700000002', text: 'not owner', fromSelf: false });
    expect(received).toHaveLength(0);
  });

  it('message from non-owner passes when owner_only is false', async () => {
    const { inner, received } = await makePolicy({ owner_id: '+40700000001', owner_only: false });
    inner.inject({ peerId: '+40700000099', text: 'anyone', fromSelf: false });
    expect(received).toHaveLength(1);
  });
});

// ─── __system__ resolution ────────────────────────────────────────────────────

describe('ChannelPolicyLayer — __system__ resolution', () => {
  it('__system__ resolves to owner_id in Mode 2', async () => {
    const { policy, inner } = await makePolicy({ owner_id: '+40700000001' });
    await policy.send('__system__', { type: 'text', text: 'broadcast' });
    expect(inner.sentTo).toHaveLength(1);
    expect(inner.sentTo[0].peerId).toBe('+40700000001');
  });

  it('__system__ resolves to selfAddress() in Mode 1', async () => {
    const { policy, inner } = await makePolicy({});
    inner._selfAddr = '40700000001@s.whatsapp.net';
    await policy.send('__system__', { type: 'text', text: 'broadcast' });
    expect(inner.sentTo).toHaveLength(1);
    expect(inner.sentTo[0].peerId).toBe('40700000001@s.whatsapp.net');
  });

  it('__system__ is dropped silently when no owner address available', async () => {
    const { policy, inner } = await makePolicy({});
    inner._selfAddr = null;
    await expect(policy.send('__system__', { type: 'text', text: 'broadcast' })).resolves.toBeUndefined();
    expect(inner.sentTo).toHaveLength(0);
  });

  it('non-__system__ send is passed through unchanged', async () => {
    const { policy, inner } = await makePolicy({});
    await policy.send('+40700000099', { type: 'text', text: 'direct' });
    expect(inner.sentTo[0].peerId).toBe('+40700000099');
  });
});

// ─── Lifecycle delegation ─────────────────────────────────────────────────────

describe('ChannelPolicyLayer — lifecycle delegation', () => {
  it('status() delegates to inner', async () => {
    const { policy, inner } = await makePolicy({});
    expect(policy.status()).toBe(inner.status());
  });

  it('start() delegates to inner', async () => {
    const { policy, inner } = await makePolicy({});
    await policy.start();
    expect(inner.status()).toBe('connected');
    expect(policy.status()).toBe('connected');
  });

  it('stop() delegates to inner', async () => {
    const { policy, inner } = await makePolicy({});
    await policy.start();
    await policy.stop();
    expect(inner.status()).toBe('disconnected');
    expect(policy.status()).toBe('disconnected');
  });

  it('selfAddress() delegates to inner', async () => {
    const { policy, inner } = await makePolicy({});
    inner._selfAddr = 'me@example.com';
    expect(policy.selfAddress()).toBe('me@example.com');
  });
});
