/**
 * WhatsApp channel adapter
 *
 * Uses @whiskeysockets/baileys v7 (pinned to 7.0.0-rc.9).
 * Auth state persisted at authDir (default: ~/.reeboot/channels/whatsapp/auth/).
 */

import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import type { ChannelAdapter, ChannelConfig, MessageBus, MessageContent, ChannelStatus } from './interface.js';
import { createIncomingMessage } from './interface.js';
import { registerChannel } from './registry.js';

const CHUNK_SIZE = 4096;
const CHUNK_DELAY_MS = 100;

export class WhatsAppAdapter implements ChannelAdapter {
  private _authDir: string;
  private _status: ChannelStatus = 'disconnected';
  private _connectedAt: string | null = null;
  private _bus: MessageBus | null = null;
  private _config: ChannelConfig | null = null;
  private _socket: any = null;
  private _reconnecting = false;

  constructor(authDir?: string) {
    this._authDir = authDir ?? join(homedir(), '.reeboot', 'channels', 'whatsapp', 'auth');
  }

  async init(config: ChannelConfig, bus: MessageBus): Promise<void> {
    this._config = config;
    this._bus = bus;
    this._status = 'initializing';
  }

  async start(): Promise<void> {
    await this._connect();
  }

  private async _connect(): Promise<void> {
    const {
      makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      Browsers,
      fetchLatestWaWebVersion,
    } = await import('@whiskeysockets/baileys');

    const qrTerminal = await import('qrcode-terminal');

    mkdirSync(this._authDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this._authDir);

    // Fetch the current WhatsApp Web version from WA servers.
    // The version bundled in Baileys RC is often stale and gets rejected (405).
    let version: [number, number, number];
    try {
      const result = await fetchLatestWaWebVersion();
      version = result.version;
      console.log(`[WhatsApp] Using WA Web version: ${version.join('.')}`);
    } catch (err) {
      console.warn(`[WhatsApp] Could not fetch latest WA version, using default: ${err}`);
      version = [2, 3000, 1027934701];
    }

    const sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.ubuntu('Chrome'),
    });

    this._socket = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n📱 Scan this QR code with WhatsApp (Settings → Linked Devices → Link a Device):\n');
        qrTerminal.default.generate(qr, { small: true });
        console.log('');
      }

      if (connection === 'open') {
        this._status = 'connected';
        this._connectedAt = new Date().toISOString();
        this._reconnecting = false;
        console.log('[WhatsApp] Connected ✓ — ready to receive messages');
      } else if (connection === 'close') {
        this._status = 'disconnected';
        this._connectedAt = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          this._status = 'error';
        } else if (!this._reconnecting) {
          this._reconnecting = true;
          await this._connect();
        }
      }
    });

    sock.ev.on('messages.upsert', ({ type, messages }: any) => {
      for (const msg of messages) {
        const peerId = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          '';

        // Only process notify-type messages
        if (type !== 'notify') continue;

        // Skip messages sent by this device, except self-chat ("message yourself")
        if (fromMe && peerId !== sock.user?.id?.replace(/:.*/, '') + '@s.whatsapp.net') continue;

        if (!peerId) continue;
        if (!text) continue;

        this._bus?.publish(
          createIncomingMessage({
            channelType: 'whatsapp',
            peerId,
            content: text,
            raw: msg,
          })
        );
      }
    });
  }

  async stop(): Promise<void> {
    this._reconnecting = true; // prevent reconnect on close
    if (this._socket) {
      try { this._socket.end(); } catch { /* ignore */ }
      this._socket = null;
    }
    this._status = 'disconnected';
  }

  async send(peerId: string, content: MessageContent): Promise<void> {
    if (!this._socket) throw new Error('WhatsApp not connected');
    const text = content.text ?? '';

    if (text.length <= CHUNK_SIZE) {
      await this._socket.sendMessage(peerId, { text });
      return;
    }

    // Chunk into CHUNK_SIZE pieces
    let offset = 0;
    while (offset < text.length) {
      const chunk = text.slice(offset, offset + CHUNK_SIZE);
      await this._socket.sendMessage(peerId, { text: chunk });
      offset += CHUNK_SIZE;
      if (offset < text.length) {
        await new Promise(r => setTimeout(r, CHUNK_DELAY_MS));
      }
    }
  }

  status(): ChannelStatus {
    return this._status;
  }

  connectedAt(): string | null {
    return this._connectedAt;
  }
}

// Self-register at module import time
registerChannel('whatsapp', () => new WhatsAppAdapter());
