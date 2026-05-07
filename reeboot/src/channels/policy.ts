/**
 * ChannelPolicyLayer
 *
 * Wraps any Tier 1 (external messaging) channel adapter and handles all
 * policy concerns, keeping the inner adapter lean and protocol-focused.
 *
 * Responsibilities:
 *   - Owner identity resolution (Mode 1: fromSelf, Mode 2: owner_id)
 *   - owner_only message gating
 *   - __system__ sentinel → owner address resolution on send
 *
 * See CHANNEL_CONTRACT.md for the full contract specification.
 */

import type {
  ChannelAdapter,
  ChannelConfig,
  MessageBus,
  MessageContent,
  ChannelStatus,
  IncomingMessage,
} from './interface.js';
import { MessageBus as MessageBusClass } from './interface.js';

export class ChannelPolicyLayer implements ChannelAdapter {
  private _inner: ChannelAdapter;
  private _ownerId: string = '';   // empty = Mode 1 (self-chat)
  private _ownerOnly: boolean = false;

  constructor(inner: ChannelAdapter) {
    this._inner = inner;
  }

  async init(config: ChannelConfig, bus: MessageBus): Promise<void> {
    const cfg = config as any;
    this._ownerId = cfg.owner_id ?? '';
    this._ownerOnly = cfg.owner_only === true;

    // Wrap the bus: intercept publish() to apply owner gate before forwarding.
    const wrappedBus = new MessageBusClass();
    // Forward all internal subscriptions from the real bus
    wrappedBus.on('message', (msg: IncomingMessage) => {
      if (this._gate(msg)) {
        bus.publish(msg);
      }
    });

    await this._inner.init(config, wrappedBus);
  }

  async start(): Promise<void> {
    return this._inner.start();
  }

  async stop(): Promise<void> {
    return this._inner.stop();
  }

  async send(peerId: string, content: MessageContent): Promise<void> {
    if (peerId === '__system__') {
      const ownerAddr = this._ownerId || this._inner.selfAddress();
      if (!ownerAddr) return; // no address known yet — silently drop
      peerId = ownerAddr;
    }
    return this._inner.send(peerId, content);
  }

  status(): ChannelStatus {
    return this._inner.status();
  }

  connectedAt(): string | null {
    return this._inner.connectedAt();
  }

  selfAddress(): string | null {
    return this._inner.selfAddress();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Returns true if the message should be forwarded to the real bus.
   *
   * Resolution order:
   *   1. Mode 2: owner_id present → owner if peerId === owner_id
   *   2. Mode 1: owner_id absent  → owner if fromSelf === true
   *   3. owner_only gate          → drop if not owner
   *   4. Otherwise pass through
   */
  private _gate(msg: IncomingMessage): boolean {
    if (!this._ownerOnly) return true;

    const isOwner = this._ownerId
      ? msg.peerId === this._ownerId          // Mode 2
      : msg.fromSelf === true;                // Mode 1

    return isOwner;
  }
}
