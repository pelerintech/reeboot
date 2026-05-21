/**
 * WhatsApp channel adapter
 *
 * Uses @whiskeysockets/baileys v6.7.x.
 * Auth state persisted at authDir (default: ~/.reeboot/channels/whatsapp/auth/).
 *
 * Reconnect design:
 *  - _connect() returns a Promise<void> that resolves on 'open' or rejects on
 *    'close' / CONNECT_TIMEOUT_MS. It is a proper awaitable connection attempt.
 *  - _reconnectLoop() is a persistent while-loop that retries with exponential
 *    backoff. It is started by the 'close' handler and runs until connected or
 *    _stopping is set.
 *  - _stopping (set by stop()) is the only way to exit the loop cleanly.
 *  - _reconnecting guards against spawning a second loop on duplicate 'close'.
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
/** How long to wait for a socket to reach 'open' before giving up. */
const CONNECT_TIMEOUT_MS = 30_000;
/** After this much cumulative downtime, emit a channel_stalled DB event. */
export const STALL_NOTIFY_MS = 5 * 60 * 1000;
/** After this much downtime, send a proactive "I'm back" message to the user. */
const BACK_ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

export class WhatsAppAdapter implements ChannelAdapter {
  private _authDir: string;
  private _status: ChannelStatus = 'disconnected';
  private _connectedAt: string | null = null;
  private _bus: MessageBus | null = null;
  private _config: ChannelConfig | null = null;
  private _socket: any = null;
  /** True while _reconnectLoop() is running — prevents a second loop from starting. */
  private _reconnecting = false;
  /** Set by stop() — causes _reconnectLoop() to exit cleanly. */
  private _stopping = false;
  private _reconnectAttempt = 0;
  /** Guards the one-time channel_stalled emission per loop. */
  private _stalledEventEmitted = false;
  /** IDs of messages we sent — used to skip our own echoes in multi-device mode. */
  private _sentIds = new Set<string>();
  /** Refresh intervals for typing indicators, keyed by peerId. */
  private _typingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  /** Last peer who sent us a message — used for back-online notification. */
  _lastActivePeer: string | null = null;
  /** Timestamp when the connection last went dark. */
  _disconnectedAt: Date | null = null;
  /** Guards back-online notification — sent at most once per reconnect cycle. */
  private _backOnlineSent = false;
  /** Overridable in tests — defaults to STALL_NOTIFY_MS (5 min). */
  _stallNotifyMs: number;

  constructor(authDir?: string, stallNotifyMs?: number) {
    this._authDir = authDir ?? join(homedir(), '.reeboot', 'channels', 'whatsapp', 'auth');
    this._stallNotifyMs = stallNotifyMs ?? STALL_NOTIFY_MS;
  }

  async init(config: ChannelConfig, bus: MessageBus): Promise<void> {
    this._config = config;
    this._bus = bus;
    this._status = 'initializing';
  }

  async start(): Promise<void> {
    this._stopping = false;
    await this._connect();
  }

  /**
   * Attempt one connection. Returns a Promise that:
   *  - resolves when 'open' fires
   *  - rejects when 'close' fires OR CONNECT_TIMEOUT_MS elapses
   */
  private _connect(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
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

        let version: [number, number, number];
        try {
          const result = await fetchLatestWaWebVersion({});
          version = result.version;
          getLogger().info({ component: 'whatsapp' }, `[WhatsApp] Using WA Web version: ${version.join('.')}`);
        } catch (err) {
          getLogger().warn({ component: 'whatsapp', err }, `[WhatsApp] Could not fetch latest WA version, using default`);
          version = [2, 3000, 1027934701];
        }

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

        let settled = false;

        // Watchdog: if neither 'open' nor 'close' fires within CONNECT_TIMEOUT_MS,
        // abort the stalled socket and reject.
        const watchdog = setTimeout(() => {
          if (settled) return;
          settled = true;
          getLogger().error({ component: 'whatsapp' }, '[WhatsApp] Connection attempt timed out — stalled socket');
          try {
            emitEvent(getDb(), { type: 'channel_stalled', severity: 17,
              payload: { channelType: 'whatsapp', reason: 'connect_timeout' } }).catch(() => {});
          } catch { /* db not ready */ }
          try { sock.end(undefined); } catch { /* ignore */ }
          reject(new Error('connect timeout'));
        }, CONNECT_TIMEOUT_MS);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update: any) => {
          const { connection, lastDisconnect, qr } = update;

          if (qr) {
            getLogger().info({ component: 'whatsapp' }, '📱 Scan this QR code with WhatsApp (Settings → Linked Devices → Link a Device)');
            (qrTerminal as any).default.generate(qr, { small: true });
          }

          if (connection === 'open') {
            if (!settled) {
              settled = true;
              clearTimeout(watchdog);
            }
            // Connected — update state
            this._status = 'connected';
            this._connectedAt = new Date().toISOString();
            this._reconnectAttempt = 0;
            this._stalledEventEmitted = false;
            const user = sock.user as any;
            getLogger().info({ component: 'whatsapp', userId: user?.id, lid: user?.lid }, '[WhatsApp] Connected ✓ — ready to receive messages');
            try { emitEvent(getDb(), { type: 'channel_connected', severity: 9, payload: { channelType: 'whatsapp' } }).catch(() => {}); } catch { /* db not ready */ }

            // Back-online notification
            const disconnectedMs = this._disconnectedAt
              ? Date.now() - this._disconnectedAt.getTime() : 0;
            this._disconnectedAt = null;
            if (disconnectedMs > BACK_ONLINE_THRESHOLD_MS && this._lastActivePeer && !this._backOnlineSent) {
              this._backOnlineSent = true;
              const mins = Math.round(disconnectedMs / 60_000);
              const text = `⚡ I'm back online. I was unreachable for ~${mins} minute${mins !== 1 ? 's' : ''}.`;
              this._socket?.sendMessage(this._lastActivePeer, { text }).catch(() => {});
              getLogger().info({ component: 'whatsapp', peerId: this._lastActivePeer, durationMs: disconnectedMs },
                '[WhatsApp] back online — notification sent');
            }

            resolve();

          } else if (connection === 'close') {
            this._status = 'disconnected';
            this._connectedAt = null;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const loggedOut = statusCode === (DisconnectReason as any).loggedOut;
            try { emitEvent(getDb(), { type: 'channel_disconnected', severity: 13,
              payload: { channelType: 'whatsapp', reason: loggedOut ? 'logged_out' : 'closed' } }).catch(() => {}); } catch { /* db not ready */ }

            if (loggedOut) {
              this._status = 'error';
              this._stopping = true; // treat logout as a stop — no more reconnects
              if (!settled) {
                settled = true;
                clearTimeout(watchdog);
                reject(lastDisconnect?.error ?? new Error('logged out'));
              }
              return;
            }

            if (!settled) {
              // First close fires before open — reject this _connect() attempt
              settled = true;
              clearTimeout(watchdog);
              reject(lastDisconnect?.error ?? new Error('connection closed'));
            } else {
              // Close fired after a previous 'open' — start reconnect loop
              if (!this._disconnectedAt) {
                this._disconnectedAt = new Date();
                this._backOnlineSent = false;
              }
              if (!this._stopping && !this._reconnecting) {
                this._reconnecting = true;
                this._reconnectLoop(statusCode ?? 'unknown').finally(() => { this._reconnecting = false; });
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
            if (type !== 'notify' && type !== 'append') continue;

            const userId = sock.user?.id?.replace(/:.*/, '');
            const userLid = (sock.user as any)?.lid?.replace(/:.*/, '');

            if (fromMe) {
              if (this._sentIds.has(msgId)) {
                this._sentIds.delete(msgId);
                continue;
              }
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

            // Track last active peer for back-online notification
            this._lastActivePeer = peerId;

            getLogger().debug({ component: 'whatsapp', type, fromMe, peerId, len: text.length }, '[WhatsApp] Received message');
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

      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Persistent reconnect loop. Retries _connect() with exponential backoff
   * until connected or _stopping is set. Called by the 'close' handler on a
   * post-open disconnect.
   */
  private async _reconnectLoop(initialStatusCode?: number | string): Promise<void> {
    const loopStartedAt = Date.now();

    while (!this._stopping) {
      this._reconnectAttempt++;
      const delayMs = Math.min(2000 * Math.pow(2, this._reconnectAttempt - 1), 60_000);
      const statusCode = this._reconnectAttempt === 1 ? (initialStatusCode ?? 'unknown') : undefined;
      getLogger().info(
        statusCode !== undefined
          ? { component: 'whatsapp', attempt: this._reconnectAttempt, delayMs, statusCode }
          : { component: 'whatsapp', attempt: this._reconnectAttempt, delayMs },
        `[WhatsApp] Reconnecting in ${delayMs / 1000}s…`);
      await new Promise(res => setTimeout(res, delayMs));

      if (this._stopping) break;

      try {
        await this._connect();
        // Connected — exit loop
        this._reconnectAttempt = 0;
        return;
      } catch (err: any) {
        const reason = err?.message ?? 'unknown';
        getLogger().warn({ component: 'whatsapp', attempt: this._reconnectAttempt, reason },
          '[WhatsApp] Reconnect attempt failed — will retry');

        // Emit stalled event once per loop after _stallNotifyMs
        const durationMs = Date.now() - loopStartedAt;
        if (durationMs > this._stallNotifyMs && !this._stalledEventEmitted) {
          this._stalledEventEmitted = true;
          try {
            emitEvent(getDb(), { type: 'channel_stalled', severity: 17,
              payload: { channelType: 'whatsapp', durationMs, attempt: this._reconnectAttempt } }).catch(() => {});
          } catch { /* db not ready */ }
        }
      }
    }
  }

  async stop(): Promise<void> {
    this._stopping = true;
    if (this._socket) {
      try { this._socket.end(); } catch { /* ignore */ }
      this._socket = null;
    }
    this._status = 'disconnected';
  }

  async send(peerId: string, content: MessageContent): Promise<void> {
    if (!this._socket || this._status !== 'connected') {
      getLogger().warn({ component: 'whatsapp', peerId, status: this._status },
        '[WhatsApp] send() called while not connected — message dropped');
      return;
    }

    const text = content.text ?? '';

    const trackSent = (result: any) => {
      const id = result?.key?.id;
      if (id) {
        this._sentIds.add(id);
        setTimeout(() => this._sentIds.delete(id), 30_000);
      }
    };

    if (text.length <= CHUNK_SIZE) {
      trackSent(await this._socket.sendMessage(peerId, { text }));
      return;
    }

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
      if (this._typingIntervals.has(peerId)) return;
      await this._socket.sendPresenceUpdate('composing', peerId);
      const intervalId = setInterval(() => {
        try { this._socket?.sendPresenceUpdate('composing', peerId); } catch { /* cosmetic */ }
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
          return
        }

        if (!resolved) {
          await connect()
        }
      }
    })
  }

  await connect()
}
