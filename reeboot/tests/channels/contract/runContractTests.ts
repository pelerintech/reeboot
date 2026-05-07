/**
 * Shared Tier 1 contract test suite.
 *
 * Call runChannelContractTests(factory) from any channel's *.contract.test.ts.
 * The factory receives a mock MessageBus and must return a connected-ready adapter
 * backed by a mock/in-memory transport (no real network).
 *
 * The factory shape:
 *   type Tier1Factory = (opts: {
 *     bus: MessageBus;
 *     simulateSend: (peerId: string, text: string) => void; // inject inbound echo
 *   }) => {
 *     adapter: ChannelAdapter;
 *     simulateInbound: (msg: { peerId: string; text: string; fromSelf: boolean }) => void;
 *   }
 */

import { describe, it, expect, vi } from 'vitest';
import type { ChannelAdapter, MessageBus, MessageContent } from '@src/channels/interface.js';

export type Tier1FactoryResult = {
  adapter: ChannelAdapter;
  /** Inject a raw inbound message as if received from the transport */
  simulateInbound: (msg: { peerId: string; text: string; fromSelf: boolean }) => void;
  /** Inject an echo of a previously-sent message (to test dedup) */
  simulateEcho: (peerId: string, text: string) => void;
  /**
   * Optional async setup called after init() and before inbound/echo tests.
   * Use this to start mock transports, simulate connection-open events, etc.
   */
  setup?: () => Promise<void>;
};

export type Tier1Factory = (bus: MessageBus) => Tier1FactoryResult;

export function runChannelContractTests(factory: Tier1Factory, expectFail = false): void {
  const _it = expectFail ? it.fails : it;

  describe('Tier 1 contract: send() silent drop when not connected', () => {
    _it('send() returns without throwing when not started', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const { adapter } = factory(bus);
      await adapter.init({ enabled: true }, bus);
      // NOT started — status should be 'initializing'
      await expect(adapter.send('some-peer', { type: 'text', text: 'hello' })).resolves.toBeUndefined();
    });

    _it('send() with __system__ returns without throwing when not started', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const { adapter } = factory(bus);
      await adapter.init({ enabled: true }, bus);
      await expect(adapter.send('__system__', { type: 'text', text: 'hello' })).resolves.toBeUndefined();
    });
  });

  describe('Tier 1 contract: lifecycle', () => {
    _it('init() transitions status to initializing', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const { adapter } = factory(bus);
      await adapter.init({ enabled: true }, bus);
      expect(adapter.status()).toBe('initializing');
    });

    _it('stop() transitions status to disconnected', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const { adapter } = factory(bus);
      await adapter.init({ enabled: true }, bus);
      await adapter.stop();
      expect(adapter.status()).toBe('disconnected');
    });

    _it('stop() does not throw when called twice', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const { adapter } = factory(bus);
      await adapter.init({ enabled: true }, bus);
      await adapter.stop();
      await expect(adapter.stop()).resolves.toBeUndefined();
    });
  });

  describe('Tier 1 contract: fromSelf on inbound messages', () => {
    _it('message from own account has fromSelf=true', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const received: any[] = [];
      bus.onMessage((m) => received.push(m));
      const result = factory(bus);
      await result.adapter.init({ enabled: true }, bus);
      if (result.setup) await result.setup();

      result.simulateInbound({ peerId: 'self', text: 'from me', fromSelf: true });

      expect(received).toHaveLength(1);
      expect(received[0].fromSelf).toBe(true);
    });

    _it('message from third party has fromSelf=false', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const received: any[] = [];
      bus.onMessage((m) => received.push(m));
      const result = factory(bus);
      await result.adapter.init({ enabled: true }, bus);
      if (result.setup) await result.setup();

      result.simulateInbound({ peerId: 'other', text: 'from someone else', fromSelf: false });

      expect(received).toHaveLength(1);
      expect(received[0].fromSelf).toBe(false);
    });
  });

  describe('Tier 1 contract: echo deduplication', () => {
    _it('echo of a sent message is suppressed', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const received: any[] = [];
      bus.onMessage((m) => received.push(m));
      const result = factory(bus);
      await result.adapter.init({ enabled: true }, bus);
      if (result.setup) await result.setup();

      // Simulate: adapter sent a message, transport echoes it back
      result.simulateEcho('peer-a', 'agent reply');

      expect(received).toHaveLength(0);
    });
  });
}
