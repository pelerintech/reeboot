/**
 * Signal channel adapter
 *
 * Uses bbernhard/signal-cli-rest-api Docker sidecar.
 *
 * Receive strategy depends on the API mode reported by /v1/about:
 *   - json-rpc mode → WebSocket on ws://host/v1/receive/<number>
 *   - normal/native mode → HTTP polling GET /v1/receive/<number>
 *
 * Sends via POST /v2/send (same for all modes).
 */

import { execSync } from 'child_process';
import { WebSocket } from 'ws';
import type { ChannelAdapter, ChannelConfig, MessageBus, MessageContent, ChannelStatus } from './interface.js';
import { createIncomingMessage } from './interface.js';
import { registerChannel } from './registry.js';

const CHUNK_SIZE = 4096;
const CHUNK_DELAY_MS = 100;
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_API_PORT = 8080;
const WS_RECONNECT_DELAY_MS = 3000;

// ─── Config ───────────────────────────────────────────────────────────────────

export interface SignalAdapterOptions {
  phoneNumber?: string;
  apiPort?: number;
  pollInterval?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Check if a signal-cli-rest-api Docker container is running.
 * Returns true if found, false otherwise.
 */
export function detectSignalContainer(): boolean {
  try {
    const output = execSync(
      'docker ps --filter name=signal-cli-rest-api --format "{{.Names}}"',
      { stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString().trim();
    return output.length > 0 && output.includes('signal-cli-rest-api');
  } catch {
    return false;
  }
}

/**
 * Check if Docker daemon is running.
 */
function isDockerRunning(): boolean {
  try {
    execSync('docker info', { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

// ─── SignalAdapter ─────────────────────────────────────────────────────────────

export class SignalAdapter implements ChannelAdapter {
  private _status: ChannelStatus = 'disconnected';
  private _connectedAt: string | null = null;
  private _bus: MessageBus | null = null;

  // HTTP polling (normal/native mode)
  private _pollTimer: ReturnType<typeof setInterval> | null = null;

  // WebSocket (json-rpc mode)
  private _ws: WebSocket | null = null;
  private _wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _wsStopped = false;

  readonly _phoneNumber: string;
  readonly _apiPort: number;
  readonly _pollInterval: number;

  constructor(opts: SignalAdapterOptions = {}) {
    this._phoneNumber = opts.phoneNumber ?? '';
    this._apiPort = opts.apiPort ?? DEFAULT_API_PORT;
    this._pollInterval = opts.pollInterval ?? DEFAULT_POLL_INTERVAL_MS;
  }

  private get _baseUrl(): string {
    return `http://127.0.0.1:${this._apiPort}`;
  }

  private get _wsBaseUrl(): string {
    return `ws://127.0.0.1:${this._apiPort}`;
  }

  async init(config: ChannelConfig, bus: MessageBus): Promise<void> {
    const signalConfig = config as any;
    if (signalConfig.phoneNumber) this._setPhoneNumber(signalConfig.phoneNumber);
    if (signalConfig.apiPort) this._setApiPort(signalConfig.apiPort);
    this._bus = bus;
    this._status = 'disconnected';
  }

  private _setPhoneNumber(n: string) { (this as any)._phoneNumber = n; }
  private _setApiPort(p: number) { (this as any)._apiPort = p; }

  async start(): Promise<void> {
    if (!isDockerRunning()) {
      this._status = 'error';
      console.error('[Signal] Docker is not running — cannot start Signal adapter');
      return;
    }

    if (!detectSignalContainer()) {
      console.warn('[Signal] signal-cli-rest-api container not found — try: reeboot channels login signal');
    }

    // Detect API mode from /v1/about
    let mode = 'normal';
    try {
      const res = await fetch(`${this._baseUrl}/v1/about`);
      if (res.ok) {
        const body = await res.json() as any;
        mode = body?.mode ?? 'normal';
      }
    } catch {
      // Assume normal mode if unreachable
    }

    this._status = 'connected';
    this._connectedAt = new Date().toISOString();

    if (mode === 'json-rpc') {
      console.log('[Signal] Connected ✓ — listening via WebSocket (json-rpc mode)');
      this._wsStopped = false;
      this._connectWebSocket();
    } else {
      console.log(`[Signal] Connected ✓ — polling for messages (${mode} mode)`);
      this._startPolling();
    }
  }

  // ── WebSocket receive (json-rpc mode) ──────────────────────────────────────

  private _connectWebSocket(): void {
    if (this._wsStopped || !this._phoneNumber) return;

    const encoded = encodeURIComponent(this._phoneNumber);
    const url = `${this._wsBaseUrl}/v1/receive/${encoded}`;

    const ws = new WebSocket(url);
    this._ws = ws;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this._handleIncomingMessage(msg);
      } catch {
        // Ignore unparseable frames
      }
    });

    ws.on('error', (err) => {
      console.error(`[Signal] WebSocket error: ${err.message}`);
    });

    ws.on('close', () => {
      this._ws = null;
      if (!this._wsStopped) {
        // Reconnect after delay
        this._wsReconnectTimer = setTimeout(() => {
          this._connectWebSocket();
        }, WS_RECONNECT_DELAY_MS);
      }
    });
  }

  // ── HTTP polling (normal/native mode) ─────────────────────────────────────

  private _startPolling(): void {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(() => {
      this._poll().catch((err) => {
        console.error(`[Signal] Poll error: ${err}`);
      });
    }, this._pollInterval);
  }

  private async _poll(): Promise<void> {
    if (!this._phoneNumber) return;
    try {
      const encoded = encodeURIComponent(this._phoneNumber);
      const res = await fetch(`${this._baseUrl}/v1/receive/${encoded}`);
      if (!res.ok) return;
      const messages: any[] = await res.json() as any[];
      for (const msg of messages) {
        this._handleIncomingMessage(msg);
      }
    } catch {
      // Poll errors are non-fatal
    }
  }

  // ── Shared message handler ─────────────────────────────────────────────────

  private _handleIncomingMessage(msg: any): void {
    const envelope = msg?.envelope;
    if (!envelope) return;

    const source: string = envelope.sourceNumber ?? envelope.source ?? '';
    let text = '';
    let peerId = source;

    if (envelope.dataMessage) {
      // Regular incoming message from another user — ignore if it's from ourselves
      if (source === this._phoneNumber) return;
      text = envelope.dataMessage.message ?? '';
    } else if (envelope.syncMessage?.sentMessage) {
      // Note-to-self: message synced from our own device
      const sent = envelope.syncMessage.sentMessage;
      text = sent.message ?? '';
      peerId = sent.destinationNumber ?? sent.destination ?? source;
    }

    if (!text) return;

    this._bus?.publish(
      createIncomingMessage({
        channelType: 'signal',
        peerId,
        content: text,
        raw: msg,
      })
    );
  }

  // ── Stop ───────────────────────────────────────────────────────────────────

  async stop(): Promise<void> {
    // Stop HTTP polling
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    // Stop WebSocket
    this._wsStopped = true;
    if (this._wsReconnectTimer) {
      clearTimeout(this._wsReconnectTimer);
      this._wsReconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }

    this._status = 'disconnected';
    this._connectedAt = null;
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  async send(peerId: string, content: MessageContent): Promise<void> {
    const text = content.text ?? '';

    if (text.length <= CHUNK_SIZE) {
      await this._sendChunk(peerId, text);
      return;
    }

    let offset = 0;
    while (offset < text.length) {
      const chunk = text.slice(offset, offset + CHUNK_SIZE);
      await this._sendChunk(peerId, chunk);
      offset += CHUNK_SIZE;
      if (offset < text.length) {
        await new Promise(r => setTimeout(r, CHUNK_DELAY_MS));
      }
    }
  }

  private async _sendChunk(peerId: string, text: string): Promise<void> {
    const res = await fetch(`${this._baseUrl}/v2/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        number: this._phoneNumber,
        recipients: [peerId],
      }),
    });
    if (!res.ok) {
      throw new Error(`Signal send failed: HTTP ${res.status}`);
    }
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  status(): ChannelStatus {
    return this._status;
  }

  connectedAt(): string | null {
    return this._connectedAt;
  }
}

// Self-register at module import time
registerChannel('signal', () => new SignalAdapter());

// ─── linkSignalDevice (wizard) ────────────────────────────────────────────────

/**
 * Initiates a Signal device-linking flow for the setup wizard.
 * Assumes Docker is already running and signal-cli-rest-api container is available.
 * Calls onQr with the QR link URL, onSuccess on link, onTimeout after 3 minutes.
 */
export async function linkSignalDevice(opts: {
  phoneNumber: string
  apiPort?: number
  onQr: (url: string) => void
  onSuccess: () => void
  onTimeout: () => void
  timeoutMs?: number
}): Promise<void> {
  const { phoneNumber, apiPort = 8080, onQr, onSuccess, onTimeout, timeoutMs = 180_000 } = opts
  const baseUrl = `http://127.0.0.1:${apiPort}`

  let resolved = false

  const timeoutHandle = setTimeout(() => {
    if (!resolved) {
      resolved = true
      onTimeout()
    }
  }, timeoutMs)

  // Get QR link URL from signal-cli-rest-api
  try {
    const res = await fetch(`${baseUrl}/v1/qrcodelink?device_name=reeboot`, {
      method: 'GET',
    })
    if (res.ok) {
      const url = `${baseUrl}/v1/qrcodelink?device_name=reeboot`
      if (!resolved) onQr(url)
    }
  } catch {
    // Ignore — will timeout
  }

  // Poll for successful link
  const pollInterval = setInterval(async () => {
    if (resolved) {
      clearInterval(pollInterval)
      return
    }
    try {
      const encoded = encodeURIComponent(phoneNumber)
      const res = await fetch(`${baseUrl}/v1/accounts`)
      if (res.ok) {
        const accounts = await res.json() as string[]
        if (accounts.includes(phoneNumber)) {
          resolved = true
          clearTimeout(timeoutHandle)
          clearInterval(pollInterval)
          onSuccess()
        }
      }
    } catch {
      // Ignore poll errors
    }
  }, 2000)
}
