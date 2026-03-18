/**
 * Signal adapter tests (task 1.1) — TDD red
 *
 * Uses a mock of the signal-cli REST API (fetch) and Docker subprocess so no
 * real Docker or Signal connection is made.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MessageBus } from '@src/channels/interface.js';

// ─── fetch mock ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── child_process mock ───────────────────────────────────────────────────────

const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
  execSync: mockExecSync,
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: Buffer.from('') }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReceiveResponse(messages: any[]) {
  return { ok: true, json: async () => messages };
}

function makeSendResponse() {
  return { ok: true, json: async () => ({}) };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SignalAdapter', () => {
  let SignalAdapter: any;
  let adapter: any;
  let bus: MessageBus;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Default: Docker running, no receive messages
    mockExecSync.mockReturnValue(Buffer.from('running'));
    mockFetch.mockResolvedValue(makeReceiveResponse([]));

    const mod = await import('@src/channels/signal.js');
    SignalAdapter = mod.SignalAdapter;
    bus = new MessageBus();
    adapter = new SignalAdapter({
      phoneNumber: '+1234567890',
      apiPort: 8080,
      pollInterval: 1000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    adapter?.stop?.().catch(() => {});
  });

  // ── Status ─────────────────────────────────────────────────────────────────

  it('initial status is disconnected', () => {
    expect(adapter.status()).toBe('disconnected');
  });

  it('adapter reports error status if Docker is not running', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('Cannot connect to the Docker daemon');
    });

    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    expect(adapter.status()).toBe('error');
  });

  it('adapter connects when signal-cli container is running', async () => {
    mockExecSync.mockReturnValue(Buffer.from('running'));
    mockFetch.mockResolvedValue(makeReceiveResponse([]));

    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    expect(adapter.status()).toBe('connected');
  });

  // ── Polling ────────────────────────────────────────────────────────────────

  it('incoming message is emitted on bus with channelType: "signal"', async () => {
    const receivedMessages: any[] = [];
    bus.onMessage((msg) => receivedMessages.push(msg));

    const signalMsg = {
      envelope: {
        source: '+1987654321',
        sourceNumber: '+1987654321',
        dataMessage: { message: 'Hello from Signal' },
      },
    };

    mockFetch
      .mockResolvedValueOnce(makeReceiveResponse([]))   // start() connectivity check
      .mockResolvedValueOnce(makeReceiveResponse([signalMsg]))  // first poll
      .mockResolvedValue(makeReceiveResponse([]));

    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    // Advance time to trigger the setInterval poll callback
    await vi.advanceTimersByTimeAsync(1100);

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0].channelType).toBe('signal');
    expect(receivedMessages[0].content).toBe('Hello from Signal');
    expect(receivedMessages[0].peerId).toBe('+1987654321');
  });

  it('own messages (from self) are ignored', async () => {
    const receivedMessages: any[] = [];
    bus.onMessage((msg) => receivedMessages.push(msg));

    const ownMsg = {
      envelope: {
        source: '+1234567890', // same as our phone number
        sourceNumber: '+1234567890',
        dataMessage: { message: 'My own message' },
      },
    };

    mockFetch
      .mockResolvedValueOnce(makeReceiveResponse([]))  // start() connectivity check
      .mockResolvedValueOnce(makeReceiveResponse([ownMsg]))  // first poll
      .mockResolvedValue(makeReceiveResponse([]));

    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    await vi.advanceTimersByTimeAsync(1100);

    expect(receivedMessages).toHaveLength(0);
  });

  it('poll interval is configurable', async () => {
    const customAdapter = new SignalAdapter({
      phoneNumber: '+1234567890',
      apiPort: 8080,
      pollInterval: 2000,
    });
    await customAdapter.init({ enabled: true }, bus);
    await customAdapter.start();

    expect((customAdapter as any)._pollInterval).toBe(2000);
    await customAdapter.stop();
  });

  // ── Send ───────────────────────────────────────────────────────────────────

  it('short message sent via POST /v2/send', async () => {
    // /v1/about for start(), then /v2/send for the actual send
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // /v1/about
      .mockResolvedValue(makeSendResponse());

    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    await adapter.send('+1987654321', { type: 'text', text: 'Hello Signal' });

    // Find the send call (not the receive polls)
    const sendCall = mockFetch.mock.calls.find(
      (c: any[]) => c[0]?.includes?.('/v2/send') && c[1]?.method === 'POST'
    );
    expect(sendCall).toBeDefined();
    const body = JSON.parse(sendCall![1].body);
    expect(body.message).toBe('Hello Signal');
    expect(body.number).toBe('+1234567890');
    expect(body.recipients).toContain('+1987654321');
  });

  it('long message (>4096 chars) is chunked into multiple send calls', async () => {
    mockFetch.mockResolvedValue(makeSendResponse());

    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    // Stop polling to avoid infinite timer loop
    await adapter.stop();

    const longText = 'A'.repeat(4097);
    // Run send + advance fake timers to flush the CHUNK_DELAY_MS setTimeout
    const sendPromise = adapter.send('+1987654321', { type: 'text', text: longText });
    await vi.advanceTimersByTimeAsync(500); // cover 100ms CHUNK_DELAY_MS
    await sendPromise;

    const sendCalls = mockFetch.mock.calls.filter(
      (c: any[]) => c[0]?.includes?.('/v2/send') && c[1]?.method === 'POST'
    );
    expect(sendCalls.length).toBeGreaterThan(1);
  });

  // ── Stop ───────────────────────────────────────────────────────────────────

  it('stop() sets status to disconnected and halts polling', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    expect(adapter.status()).toBe('connected');

    await adapter.stop();
    expect(adapter.status()).toBe('disconnected');
  });
});

// ─── Login helper tests ───────────────────────────────────────────────────────

describe('detectSignalContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true if signal-cli-rest-api container is already running', async () => {
    mockExecSync.mockReturnValue(Buffer.from('signal-cli-rest-api'));

    const { detectSignalContainer } = await import('@src/channels/signal.js');
    const running = detectSignalContainer();
    expect(running).toBe(true);
  });

  it('returns false if container is not running', async () => {
    mockExecSync.mockReturnValue(Buffer.from(''));

    const { detectSignalContainer } = await import('@src/channels/signal.js');
    const running = detectSignalContainer();
    expect(running).toBe(false);
  });
});
