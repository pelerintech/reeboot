/**
 * linkWhatsAppDevice reconnect tests
 *
 * Covers the 515 (restartRequired) post-pairing reconnect path, the happy path
 * (direct open), the timeout path, and the loggedOut (401) fatal-abort path.
 *
 * Baileys is fully mocked — no real sockets created.
 * Pattern mirrors whatsapp.test.ts: top-level mock, per-test socket control.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// ─── Socket factory ───────────────────────────────────────────────────────────
// Each makeWASocket() call pushes a fresh socket into createdSockets.
// Tests grab sockets by index to emit events on them.

const createdSockets: Array<{ ev: EventEmitter; end: ReturnType<typeof vi.fn> }> = [];

const mockMakeWASocket = vi.fn(() => {
  const ev = new EventEmitter() as any;
  const sock = { ev, end: vi.fn() };
  createdSockets.push(sock);
  return sock;
});

const mockSaveCreds = vi.fn();
const mockUseMultiFileAuthState = vi.fn().mockResolvedValue({
  state: { creds: {}, keys: {} },
  saveCreds: mockSaveCreds,
});
const mockFetchLatestWaWebVersion = vi.fn().mockResolvedValue({
  version: [2, 3000, 1027934701],
});

vi.mock('@whiskeysockets/baileys', () => ({
  default: mockMakeWASocket,
  makeWASocket: mockMakeWASocket,
  useMultiFileAuthState: mockUseMultiFileAuthState,
  DisconnectReason: { loggedOut: 401, restartRequired: 515 },
  Browsers: { ubuntu: () => ['Ubuntu', 'Chrome', '20.0.0'] },
  fetchLatestWaWebVersion: mockFetchLatestWaWebVersion,
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, mkdirSync: vi.fn() };
});

// ─── Import under test ────────────────────────────────────────────────────────

import { linkWhatsAppDevice } from '@src/channels/whatsapp.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Flush all pending microtasks and settled promises */
async function flushAsync(ms = 30) {
  await new Promise(r => setTimeout(r, ms));
}

/** Emit connection.update on a socket after settled microtasks */
function emitUpdate(sock: { ev: EventEmitter }, update: object) {
  Promise.resolve().then(() => sock.ev.emit('connection.update', update));
}

/** Wait until createdSockets reaches the expected count, polling up to maxMs */
async function waitForSockets(count: number, maxMs = 200): Promise<void> {
  const start = Date.now();
  while (createdSockets.length < count && Date.now() - start < maxMs) {
    await new Promise(r => setTimeout(r, 5));
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('linkWhatsAppDevice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createdSockets.length = 0;
    mockUseMultiFileAuthState.mockResolvedValue({
      state: { creds: {}, keys: {} },
      saveCreds: mockSaveCreds,
    });
    mockFetchLatestWaWebVersion.mockResolvedValue({ version: [2, 3000, 1027934701] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onSuccess after 515 (restartRequired) → reconnect → open', async () => {
    const onQr = vi.fn();
    const onSuccess = vi.fn();
    const onTimeout = vi.fn();

    const linkPromise = linkWhatsAppDevice({
      authDir: '/tmp/test-link',
      onQr,
      onSuccess,
      onTimeout,
      timeoutMs: 5000,
    });

    // Wait for first socket
    await waitForSockets(1);
    expect(createdSockets).toHaveLength(1);

    // Emit 515 close on first socket
    emitUpdate(createdSockets[0], {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 515 } } },
    });

    // Wait for second socket (reconnect)
    await waitForSockets(2);
    expect(createdSockets).toHaveLength(2);

    // Emit open on second socket
    emitUpdate(createdSockets[1], { connection: 'open' });

    await flushAsync(50);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();

    await linkPromise.catch(() => {});
  });

  it('calls onSuccess directly when first socket opens (no 515)', async () => {
    const onQr = vi.fn();
    const onSuccess = vi.fn();
    const onTimeout = vi.fn();

    const linkPromise = linkWhatsAppDevice({
      authDir: '/tmp/test-link',
      onQr,
      onSuccess,
      onTimeout,
      timeoutMs: 5000,
    });

    await waitForSockets(1);

    emitUpdate(createdSockets[0], { connection: 'open' });

    await flushAsync(50);

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(createdSockets).toHaveLength(1);

    await linkPromise.catch(() => {});
  });

  it('calls onTimeout when no open fires within timeoutMs', async () => {
    const onQr = vi.fn();
    const onSuccess = vi.fn();
    const onTimeout = vi.fn();

    // Use a short real timeout — 80ms is enough for CI
    const linkPromise = linkWhatsAppDevice({
      authDir: '/tmp/test-link',
      onQr,
      onSuccess,
      onTimeout,
      timeoutMs: 80,
    });

    // Wait longer than the timeout
    await flushAsync(200);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();

    await linkPromise.catch(() => {});
  });

  it('does not reconnect on loggedOut (401) — fatal abort', async () => {
    const onQr = vi.fn();
    const onSuccess = vi.fn();
    const onTimeout = vi.fn();

    linkWhatsAppDevice({
      authDir: '/tmp/test-link',
      onQr,
      onSuccess,
      onTimeout,
      timeoutMs: 5000,
    });

    await waitForSockets(1);
    expect(createdSockets).toHaveLength(1);

    emitUpdate(createdSockets[0], {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    });

    await flushAsync(80);

    // No second socket created
    expect(createdSockets).toHaveLength(1);
    // Neither callback fired immediately
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('onSuccess fires only once even if open emits multiple times', async () => {
    const onSuccess = vi.fn();
    const onTimeout = vi.fn();

    const linkPromise = linkWhatsAppDevice({
      authDir: '/tmp/test-link',
      onQr: vi.fn(),
      onSuccess,
      onTimeout,
      timeoutMs: 5000,
    });

    await waitForSockets(1);

    // Fire open twice on same socket
    emitUpdate(createdSockets[0], { connection: 'open' });
    emitUpdate(createdSockets[0], { connection: 'open' });

    await flushAsync(50);

    expect(onSuccess).toHaveBeenCalledTimes(1);

    await linkPromise.catch(() => {});
  });
});
