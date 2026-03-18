/**
 * Web channel adapter
 *
 * Thin ChannelAdapter wrapping the existing WebSocket handler so it
 * participates in the ChannelRegistry and MessageBus.
 *
 * The actual WebSocket connection management is handled by server.ts;
 * this adapter bridges it to the bus by providing a way for the WS handler
 * to push IncomingMessages and for the orchestrator to call send().
 *
 * In Phase 1 the WebChat already works via ws-chat.ts — this adapter
 * registers as "web" so the registry knows about it and can report status.
 */

import type { ChannelAdapter, ChannelConfig, MessageBus, MessageContent, ChannelStatus } from './interface.js';
import { registerChannel } from './registry.js';

export class WebAdapter implements ChannelAdapter {
  private _status: ChannelStatus = 'disconnected';
  private _connectedAt: string | null = null;
  private _bus: MessageBus | null = null;
  // Map of peerId → send function (registered by the WS handler)
  private _senders = new Map<string, (content: MessageContent) => Promise<void>>();

  async init(_config: ChannelConfig, bus: MessageBus): Promise<void> {
    this._bus = bus;
    this._status = 'initializing';
  }

  async start(): Promise<void> {
    // WebSocket server lifecycle is managed by Fastify; we just mark connected
    this._status = 'connected';
    this._connectedAt = new Date().toISOString();
  }

  async stop(): Promise<void> {
    this._status = 'disconnected';
    this._connectedAt = null;
    this._senders.clear();
  }

  async send(peerId: string, content: MessageContent): Promise<void> {
    const sender = this._senders.get(peerId);
    if (sender) {
      await sender(content);
    }
  }

  status(): ChannelStatus {
    return this._status;
  }

  connectedAt(): string | null {
    return this._connectedAt;
  }

  /**
   * Register a sender function for a connected WebSocket peer.
   * Called by the WS chat handler when a client connects.
   */
  registerPeer(peerId: string, sender: (content: MessageContent) => Promise<void>): void {
    this._senders.set(peerId, sender);
  }

  unregisterPeer(peerId: string): void {
    this._senders.delete(peerId);
  }

  getBus(): MessageBus | null {
    return this._bus;
  }
}

// Singleton instance so server.ts can access the same object
export const webAdapter = new WebAdapter();

// Self-register at import time
registerChannel('web', () => webAdapter);
