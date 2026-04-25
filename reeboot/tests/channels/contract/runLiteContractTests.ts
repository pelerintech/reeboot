/**
 * Shared Tier 2 (local interface) contract test suite.
 *
 * Call runLiteContractTests(factory) from any local-interface channel's *.contract.test.ts.
 *
 * The factory shape:
 *   type Tier2Factory = (bus: MessageBus) => {
 *     adapter: ChannelAdapter & { registerPeer(id, fn): void };
 *   }
 */

import { describe, it, expect, vi } from 'vitest';
import type { ChannelAdapter, MessageBus, MessageContent } from '@src/channels/interface.js';

export type Tier2FactoryResult = {
  adapter: ChannelAdapter & {
    registerPeer(peerId: string, sender: (content: MessageContent) => Promise<void>): void;
  };
};

export type Tier2Factory = (bus: MessageBus) => Tier2FactoryResult;

export function runLiteContractTests(factory: Tier2Factory): void {

  describe('Tier 2 contract: send() silent drop when not connected', () => {
    it('send() returns without throwing when not started', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const { adapter } = factory(bus);
      await adapter.init({ enabled: true }, bus);
      await expect(adapter.send('some-peer', { type: 'text', text: 'hello' })).resolves.toBeUndefined();
    });
  });

  describe('Tier 2 contract: __system__ broadcasts to all peers', () => {
    it('broadcasts to all registered peers', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const { adapter } = factory(bus);
      await adapter.init({ enabled: true }, bus);
      await adapter.start();

      const receivedA: MessageContent[] = [];
      const receivedB: MessageContent[] = [];
      adapter.registerPeer('peer-a', async (c) => { receivedA.push(c); });
      adapter.registerPeer('peer-b', async (c) => { receivedB.push(c); });

      await adapter.send('__system__', { type: 'text', text: 'hello' });

      expect(receivedA).toHaveLength(1);
      expect(receivedA[0].text).toBe('hello');
      expect(receivedB).toHaveLength(1);
      expect(receivedB[0].text).toBe('hello');
    });

    it('__system__ with no peers returns without throwing', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const { adapter } = factory(bus);
      await adapter.init({ enabled: true }, bus);
      await adapter.start();
      await expect(adapter.send('__system__', { type: 'text', text: 'hello' })).resolves.toBeUndefined();
    });

    it('__system__ broadcast continues if one peer sender throws', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const { adapter } = factory(bus);
      await adapter.init({ enabled: true }, bus);
      await adapter.start();

      const receivedB: MessageContent[] = [];
      adapter.registerPeer('peer-a', async () => { throw new Error('peer-a broken'); });
      adapter.registerPeer('peer-b', async (c) => { receivedB.push(c); });

      await expect(adapter.send('__system__', { type: 'text', text: 'hello' })).resolves.toBeUndefined();
      expect(receivedB).toHaveLength(1);
    });
  });

  describe('Tier 2 contract: lifecycle', () => {
    it('init() transitions status to initializing', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const { adapter } = factory(bus);
      await adapter.init({ enabled: true }, bus);
      expect(adapter.status()).toBe('initializing');
    });

    it('stop() transitions status to disconnected', async () => {
      const { MessageBus } = await import('@src/channels/interface.js');
      const bus = new MessageBus();
      const { adapter } = factory(bus);
      await adapter.init({ enabled: true }, bus);
      await adapter.start();
      await adapter.stop();
      expect(adapter.status()).toBe('disconnected');
    });
  });
}
