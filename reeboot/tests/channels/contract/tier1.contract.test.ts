/**
 * Tier 1 contract suite run against a deliberately broken stub adapter.
 * Every contract clause should FAIL against this stub — confirming the suite
 * is actually exercising real behaviour.
 *
 * Expected result: ALL tests in this file fail.
 */

import { runChannelContractTests } from './runContractTests.js';
import type { Tier1Factory } from './runContractTests.js';
import type { ChannelAdapter, ChannelConfig, MessageBus, MessageContent, ChannelStatus } from '@src/channels/interface.js';

/**
 * Broken stub that violates every Tier 1 contract clause:
 * - throws on send() regardless of connection state
 * - never sets status to 'initializing' (stays 'disconnected')
 * - never sets fromSelf on published messages
 * - publishes echoes without deduplication
 */
class BrokenTier1Adapter implements ChannelAdapter {
  private _bus: MessageBus | null = null;
  private _status: ChannelStatus = 'disconnected';

  async init(_config: ChannelConfig, bus: MessageBus): Promise<void> {
    this._bus = bus;
    // BUG: never sets status to 'initializing'
  }

  async start(): Promise<void> {
    this._status = 'connected';
  }

  async stop(): Promise<void> {
    this._status = 'disconnected';
  }

  async send(_peerId: string, _content: MessageContent): Promise<void> {
    // BUG: throws instead of dropping silently
    throw new Error('BrokenAdapter: send() always throws');
  }

  status(): ChannelStatus { return this._status; }
  connectedAt(): string | null { return null; }
  selfAddress(): string | null { return null; }

  // Expose for factory use
  publishRaw(msg: any) { this._bus?.publish(msg); }
}

const brokenFactory: Tier1Factory = (bus) => {
  const adapter = new BrokenTier1Adapter();
  return {
    adapter,
    simulateInbound: ({ peerId, text }) => {
      // BUG: never sets fromSelf
      adapter.publishRaw({
        channelType: 'broken',
        peerId,
        content: text,
        timestamp: Date.now(),
        raw: {},
        // fromSelf intentionally omitted
      });
    },
    simulateEcho: (peerId, text) => {
      // BUG: publishes echoes without dedup
      adapter.publishRaw({
        channelType: 'broken',
        peerId,
        content: text,
        timestamp: Date.now(),
        raw: {},
      });
    },
  };
};

runChannelContractTests(brokenFactory);
