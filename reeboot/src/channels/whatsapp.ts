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
import { getLogger } from '../observability/logger.js';
import { emitEvent } from '../observability/events.js';
import { getDb } from '../db/index.js';

const CHUNK_SIZE = 4096;
const CHUNK_DELAY_MS = 100;
const TYPING_REFRESH_MS = 8_000;

export class WhatsAppAdapter implements ChannelAdapter {
  private _authDir: string;
  private _status: ChannelStatus = 'disconnected';
  private _connectedAt: string | null = null;
  private _bus: MessageBus | null = null;
  private _config: ChannelConfig | null = null;
  private _socket: any = null;
  private _reconnecting = false;
  private _reconnectAttempt = 0;
  /** IDs of messages we sent — used to skip our own echoes in multi-device mode. */
  private _sentIds = new Set<string>();
  /** Refresh intervals for typing indicators, keyed by peerId. */
  private _typingIntervals = new Map<string, ReturnType<typeof setInterval>>();

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
      const result = await fetchLatestWaWebVersion({});
      version = result.version;
      getLogger().info({ component: 'whatsapp' }, `[WhatsApp] Using WA Web version: ${version.join('.')}`);
    } catch (err) {
      getLogger().warn({ component: 'whatsapp', err }, `[WhatsApp] Could not fetch latest WA version, using default`);
      version = [2, 3000, 1027934701];
    }

    // Baileys requires a pino-compatible logger. We use a real pino child logger
    // at 'warn' level so real errors surface while internal Signal Protocol noise
    // (trace/debug/info) is suppressed.
    const baileysLogger = getLogger().child({ component: 'whatsapp' });
    baileysLogger.level = 'warn';
    const sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.ubuntu('Chrome'),
      logger: baileysLogger,
      // fetchProps times out on every connect (WA server doesn't respond to
      // this query for our client fingerprint). Messaging works without it.
      fireInitQueries: false,
    });

    this._socket = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        getLogger().info({ component: 'whatsapp' }, '📱 Scan this QR code with WhatsApp (Settings → Linked Devices → Link a Device)');
        (qrTerminal as any).default.generate(qr, { small: true });
      }

      if (connection === 'open') {
        this._status = 'connected';
        this._connectedAt = new Date().toISOString();
        this._reconnecting = false;
        this._reconnectAttempt = 0;
        const user = sock.user as any;
        getLogger().info({ component: 'whatsapp', userId: user?.id, lid: user?.lid }, '[WhatsApp] Connected ✓ — ready to receive messages');
        try { emitEvent(getDb(), { type: 'channel_connected', severity: 9, payload: { channelType: 'whatsapp' } }).catch(() => {}); } catch { /* db not ready */ }
      } else if (connection === 'close') {
        this._status = 'disconnected';
        this._connectedAt = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        try { emitEvent(getDb(), { type: 'channel_disconnected', severity: 13, payload: { channelType: 'whatsapp', reason: loggedOut ? 'logged_out' : 'closed' } }).catch(() => {}); } catch { /* db not ready */ }

        if (loggedOut) {
          this._status = 'error';
        } else if (!this._reconnecting) {
          this._reconnecting = true;
          this._reconnectAttempt++;
          // Exponential backoff: 2s, 4s, 8s … capped at 60s
          const delayMs = Math.min(2000 * Math.pow(2, this._reconnectAttempt - 1), 60_000);
          getLogger().info({ component: 'whatsapp', attempt: this._reconnectAttempt, delayMs }, `[WhatsApp] Reconnecting in ${delayMs / 1000}s…`);
          await new Promise(res => setTimeout(res, delayMs));
          try {
            await this._connect();
          } catch (err) {
            getLogger().error({ component: 'whatsapp', err }, '[WhatsApp] Reconnect attempt failed');
            this._reconnecting = false;
          }
        }
      }
    });

    sock.ev.on('messages.upsert', ({ type, messages }: any) => {
      for (const msg of messages) {
        const peerId = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        const msgId = msg.key.id ?? '';
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          '';

        // 'notify' = real-time incoming; 'append' = history/retry replay.
        // We process both so that retry-replayed messages after a Signal
        // session handshake are not silently dropped.
        if (type !== 'notify' && type !== 'append') continue;

        // Resolve user identity once per message (needed for self-chat detection
        // and @lid → @s.whatsapp.net normalization).
        const userId = sock.user?.id?.replace(/:.*/, '');
        const userLid = (sock.user as any)?.lid?.replace(/:.*/, '');

        if (fromMe) {
          // Skip echoes of messages we sent (multi-device mirror).
          if (this._sentIds.has(msgId)) {
            this._sentIds.delete(msgId);
            continue;
          }

          // Accept self-chat: "message yourself" via @s.whatsapp.net OR
          // the user's own @lid (linked-device address in multi-device mode).
          const isSelfChat =
            peerId === userId + '@s.whatsapp.net' ||
            (userLid && peerId === userLid + '@lid');

          if (!isSelfChat) continue;
        }

        if (!peerId) continue;

        if (!text) {
          getLogger().debug({ component: 'whatsapp', type, fromMe, peerId }, '[WhatsApp] Skipping empty text');
          continue;
        }

        getLogger().debug({ component: 'whatsapp', type, fromMe, peerId, len: text.length }, '[WhatsApp] Received message');
        // Mark as read immediately — before publishing to the bus
        try { sock.readMessages([msg.key]).catch(() => {}); } catch { /* socket not ready */ }

        this._bus?.publish(
          createIncomingMessage({
            channelType: 'whatsapp',
            peerId,
            content: text,
            raw: msg,
            fromSelf: !!fromMe,
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
    if (!this._socket || this._status !== 'connected') return; // not ready yet — silently drop

    const text = content.text ?? '';

    const trackSent = (result: any) => {
      const id = result?.key?.id;
      if (id) {
        this._sentIds.add(id);
        // TTL cleanup: keep the ID for 30s so that both notify and append
        // deliveries of the same echo are caught (deleting on first match
        // leaves the door open for a second delivery triggering a new turn).
        setTimeout(() => this._sentIds.delete(id), 30_000);
      }
    };

    if (text.length <= CHUNK_SIZE) {
      trackSent(await this._socket.sendMessage(peerId, { text }));
      return;
    }

    // Chunk into CHUNK_SIZE pieces
    let offset = 0;
    while (offset < text.length) {
      const chunk = text.slice(offset, offset + CHUNK_SIZE);
      trackSent(await this._socket.sendMessage(peerId, { text: chunk }));
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

  /** Returns the connected JID (e.g. '40700000001@s.whatsapp.net') or null when not connected. */
  selfAddress(): string | null {
    const userId = this._socket?.user?.id?.replace(/:.*/, '');
    return userId ? `${userId}@s.whatsapp.net` : null;
  }

  async markRead(msg: import('./interface.js').IncomingMessage): Promise<void> {
    if (!this._socket) return;
    try {
      const rawKey = typeof (msg.raw as any)?.key === 'object' ? (msg.raw as any).key : msg.raw;
      await this._socket.readMessages([rawKey]);
    } catch { /* socket not ready — cosmetic failure */ }
  }

  async startTyping(msg: import('./interface.js').IncomingMessage): Promise<void> {
    if (!this._socket) return;
    try {
      const peerId = msg.peerId;
      // Don't restart if already active
      if (this._typingIntervals.has(peerId)) return;

      await this._socket.sendPresenceUpdate('composing', peerId);
      const intervalId = setInterval(() => {
        try {
          this._socket?.sendPresenceUpdate('composing', peerId);
        } catch { /* cosmetic failure */ }
      }, TYPING_REFRESH_MS);
      this._typingIntervals.set(peerId, intervalId);
    } catch { /* socket error — cosmetic failure */ }
  }

  async stopTyping(msg: import('./interface.js').IncomingMessage): Promise<void> {
    if (!this._socket) return;
    try {
      const peerId = msg.peerId;
      const intervalId = this._typingIntervals.get(peerId);
      if (intervalId) {
        clearInterval(intervalId);
        this._typingIntervals.delete(peerId);
      }
      await this._socket.sendPresenceUpdate('paused', peerId);
    } catch { /* socket error — cosmetic failure */ }
  }
}

// Self-register at module import time
registerChannel('whatsapp', () => new WhatsAppAdapter());

// ─── linkDevice (wizard) ──────────────────────────────────────────────────────

/**
 * Initiates a device-linking flow for the setup wizard.
 * Calls onQr with the QR string, onSuccess on connection, onTimeout if not
 * connected within the 2-minute timeout.
 *
 * Accepts a temp auth directory to keep wizard state separate from production.
 */
export async function linkWhatsAppDevice(opts: {
  authDir: string
  onQr: (qr: string) => void
  onSuccess: () => void
  onTimeout: () => void
  timeoutMs?: number
}): Promise<void> {
  const { authDir, onQr, onSuccess, onTimeout, timeoutMs = 120_000 } = opts

  const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestWaWebVersion,
  } = await import('@whiskeysockets/baileys')

  const { mkdirSync } = await import('fs')
  mkdirSync(authDir, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(authDir)

  let version: [number, number, number]
  try {
    const result = await fetchLatestWaWebVersion({})
    version = result.version
  } catch {
    version = [2, 3000, 1027934701]
  }

  // Shared across all reconnect attempts
  let resolved = false

  const timeoutHandle = setTimeout(() => {
    if (!resolved) {
      resolved = true
      onTimeout()
    }
  }, timeoutMs)

  async function connect(): Promise<void> {
    const wizardLogger = getLogger().child({ component: 'whatsapp-wizard' });
    wizardLogger.level = 'warn';
    const sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.ubuntu('Chrome'),
      logger: wizardLogger,
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update

      if (qr && !resolved) {
        onQr(qr)
      }

      if (connection === 'open' && !resolved) {
        resolved = true
        clearTimeout(timeoutHandle)
        // Give baileys a moment to finish writing creds before we signal success
        setTimeout(() => {
          try { sock.end(undefined) } catch { /* ignore */ }
          onSuccess()
        }, 500)
        return
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut

        if (loggedOut) {
          // Fatal — do not reconnect; timeout will eventually fire
          return
        }

        // restartRequired (515) or any other non-fatal disconnect — reconnect
        if (!resolved) {
          await connect()
        }
      }
    })
  }

  await connect()
}
