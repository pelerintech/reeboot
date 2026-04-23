/**
 * Tier 2 contract suite run against a deliberately broken stub adapter.
 * Every contract clause should FAIL against this stub.
 *
 * Expected result: ALL tests in this file fail.
 */

import { runLiteContractTests } from './runLiteContractTests.js';
import type { Tier2Factory } from './runLiteContractTests.js';
import type { ChannelAdapter, ChannelConfig, MessageBus, MessageContent, ChannelStatus } from '@src/channels/interface.js';

/**
 * Broken stub that violates every Tier 2 clause:
 * - throws on send() regardless of state
 * - __system__ silently dropped (no broadcast)
 * - never sets status to 'initializing'
 */
class BrokenTier2Adapter implements ChannelAdapter {
  private _status: ChannelStatus = 'disconnected';

  async init(_config: ChannelConfig, _bus: MessageBus): Promise<void> {
    // BUG: never sets 'initializing'
  }

  async start(): Promise<void> {
    this._status = 'connected';
  }

  async stop(): Promise<void> {
    this._status = 'disconnected';
  }

  async send(peerId: string, _content: MessageContent): Promise<void> {
    if (peerId === '__system__') return; // BUG: silently drops instead of broadcasting
    // BUG: throws for normal peers
    throw new Error('BrokenTier2Adapter: send() throws');
  }

  status(): ChannelStatus { return this._status; }
  connectedAt(): string | null { return null; }
  selfAddress(): string | null { return null; }

  // Tier 2 adapters expose registerPeer
  registerPeer(_peerId: string, _sender: (content: MessageContent) => Promise<void>): void {
    // BUG: ignores registration — no broadcast will reach peers
  }
}

const brokenFactory: Tier2Factory = (bus) => {
  const adapter = new BrokenTier2Adapter();
  return { adapter };
};

runLiteContractTests(brokenFactory);
