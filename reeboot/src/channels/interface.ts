/**
 * Channel Adapter Interface
 *
 * Defines the ChannelAdapter, MessageBus, and related types that all channel
 * implementations must satisfy. Exported from `reeboot/channels`.
 */

import { EventEmitter } from 'events';

// ─── ChannelStatus ────────────────────────────────────────────────────────────

export const CHANNEL_STATUS_VALUES = ['connected', 'disconnected', 'error', 'initializing'] as const;
export type ChannelStatus = typeof CHANNEL_STATUS_VALUES[number];

// ─── MessageContent ───────────────────────────────────────────────────────────

export interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  /** base64-encoded image data for type === 'image' */
  imageData?: string;
  mimeType?: string;
}

// ─── IncomingMessage ──────────────────────────────────────────────────────────

export interface IncomingMessage {
  /** Which channel type originated this message, e.g. "whatsapp", "web" */
  channelType: string;
  /** Peer identifier — phone number JID for WhatsApp, socket ID for web, etc. */
  peerId: string;
  /** Plain text content extracted from the message */
  content: string;
  /** Unix timestamp (ms) when the message was received */
  timestamp: number;
  /** Provider-specific original message object (Baileys message, WS message, etc.) */
  raw: unknown;
}

/**
 * Helper to construct an IncomingMessage with defaults.
 */
export function createIncomingMessage(
  fields: Omit<IncomingMessage, 'timestamp'> & { timestamp?: number }
): IncomingMessage {
  return {
    timestamp: Date.now(),
    ...fields,
  };
}

// ─── MessageBus ───────────────────────────────────────────────────────────────

/**
 * EventEmitter-based message bus.
 * Channels emit 'message' events; the orchestrator subscribes.
 */
export class MessageBus extends EventEmitter {
  publish(message: IncomingMessage): void {
    this.emit('message', message);
  }

  onMessage(handler: (message: IncomingMessage) => void): () => void {
    this.on('message', handler);
    return () => this.off('message', handler);
  }
}

// ─── ChannelConfig ────────────────────────────────────────────────────────────

export interface ChannelConfig {
  enabled: boolean;
  /** Optional path to a custom adapter .ts file */
  adapter?: string;
  [key: string]: unknown;
}

// ─── ChannelAdapter ───────────────────────────────────────────────────────────

export interface ChannelAdapter {
  /** Initialize the adapter: register with bus, set up internals */
  init(config: ChannelConfig, bus: MessageBus): Promise<void>;
  /** Open the channel connection */
  start(): Promise<void>;
  /** Close the channel connection gracefully */
  stop(): Promise<void>;
  /** Send a message to a peer */
  send(peerId: string, content: MessageContent): Promise<void>;
  /** Current connection status */
  status(): ChannelStatus;
  /** ISO timestamp when status last became 'connected', or null */
  connectedAt(): string | null;
}
