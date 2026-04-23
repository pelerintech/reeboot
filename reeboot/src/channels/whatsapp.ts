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
  /** IDs of messages we sent — used to skip our own echoes in multi-device mode. */
  private _sentIds = new Set<string>();

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
      console.log(`[WhatsApp] Using WA Web version: ${version.join('.')}`);
    } catch (err) {
      console.warn(`[WhatsApp] Could not fetch latest WA version, using default: ${err}`);
      version = [2, 3000, 1027934701];
    }

    // Baileys requires a pino-compatible logger. We pass a no-op so its
    // internal Signal Protocol noise never reaches the console. Real errors
    // are surfaced via connection.update / our own console.* calls.
    const noop = () => {};
    const baileysLogger: any = {
      trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop,
      child: () => baileysLogger,
    };
    const sock = makeWASocket({
      version,
      auth: state,
      browser: Browsers.ubuntu('Chrome'),
      logger: baileysLogger,
    });

    this._socket = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n📱 Scan this QR code with WhatsApp (Settings → Linked Devices → Link a Device):\n');
        (qrTerminal as any).default.generate(qr, { small: true });
        console.log('');
      }

      if (connection === 'open') {
        this._status = 'connected';
        this._connectedAt = new Date().toISOString();
        this._reconnecting = false;
        const user = sock.user as any;
        console.log(`[WhatsApp] Connected ✓ — ready to receive messages (id=${user?.id} lid=${user?.lid})`);
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
          console.log(`[WhatsApp] Skipping empty text type=${type} fromMe=${fromMe} peerId=${peerId} keys=${Object.keys(msg.message ?? {}).join(',')}`);
          continue;
        }

        console.log(`[WhatsApp] Received message type=${type} fromMe=${fromMe} peerId=${peerId} len=${text.length}`);
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
    const noop2 = () => {};
    const wizardLogger: any = {
      trace: noop2, debug: noop2, info: noop2, warn: noop2, error: noop2, fatal: noop2,
      child: () => wizardLogger,
    };
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
