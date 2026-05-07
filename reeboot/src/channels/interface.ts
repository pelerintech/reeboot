/**
 * Channel Adapter Interface
 *
 * Defines the ChannelAdapter, MessageBus, and related types that all channel
 * implementations must satisfy. Exported from `reeboot/channels`.
 */

import { EventEmitter } from 'events';
import type { MessageTrust } from '../trust.js';

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
  /** Resolved trust level for this message. Absent means 'owner' (no restriction). */
  trust?: MessageTrust;
  /**
   * True when the message originated from the agent's own account on this channel
   * (e.g. WhatsApp fromMe=true self-chat, Signal syncMessage note-to-self).
   * Used by ChannelPolicyLayer for Mode 1 owner resolution.
   * Web and CLI leave this undefined — all their messages are implicitly from the owner.
   */
  fromSelf?: boolean;
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

/**
 * See src/channels/CHANNEL_CONTRACT.md for the full behavioural contract
 * that every ChannelAdapter implementation must satisfy.
 *
 * Tier 1 (External Messaging: WhatsApp, Signal, Telegram, Slack, Discord):
 *   Full contract — fromSelf resolution, echo deduplication, lifecycle, send guard.
 *
 * Tier 2 (Local Interface: Web, CLI):
 *   Lite contract — lifecycle, send guard, __system__ broadcasts to all peers.
 */
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
  /**
   * The adapter's own address on this channel — used by ChannelPolicyLayer
   * for Mode 1 (self-chat) __system__ resolution.
   * Returns null when not connected or not applicable (Web, CLI).
   */
  selfAddress(): string | null;
}
