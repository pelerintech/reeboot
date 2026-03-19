/**
 * Signal adapter tests
 *
 * Covers both modes the adapter supports:
 *   - json-rpc mode: WebSocket receive via ws://
 *   - normal mode:   HTTP polling via GET /v1/receive/<number>
 *
 * WebSocket is mocked via vi.mock('ws').
 * fetch is mocked for /v1/about (mode detection) and /v2/send.
 * child_process is mocked so no real Docker calls are made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
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

// ─── ws mock ─────────────────────────────────────────────────────────────────

class MockWebSocket extends EventEmitter {
  static lastInstance: MockWebSocket | null = null;
  url: string;
  closed = false;

  constructor(url: string) {
    super();
    this.url = url;
    MockWebSocket.lastInstance = this;
    // Simulate async open
    Promise.resolve().then(() => this.emit('open'));
  }

  close() {
    this.closed = true;
    this.emit('close', 1000, Buffer.from(''));
  }

  // Helper to simulate server pushing a message
  simulateMessage(data: object) {
    this.emit('message', Buffer.from(JSON.stringify(data)));
  }
}

vi.mock('ws', () => ({
  WebSocket: MockWebSocket,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function aboutResponse(mode: string) {
  return { ok: true, json: async () => ({ mode, versions: ['v1', 'v2'], build: 2 }) };
}

function makeSendResponse() {
  return { ok: true, status: 201, json: async () => ({}) };
}

function makeDataMessage(fromNumber: string, text: string) {
  return {
    envelope: {
      source: fromNumber,
      sourceNumber: fromNumber,
      dataMessage: { message: text },
    },
  };
}

function makeSyncMessage(fromNumber: string, toNumber: string, text: string) {
  return {
    envelope: {
      source: fromNumber,
      sourceNumber: fromNumber,
      syncMessage: {
        sentMessage: {
          destination: toNumber,
          destinationNumber: toNumber,
          message: text,
        },
      },
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SignalAdapter — json-rpc mode (WebSocket)', () => {
  let SignalAdapter: any;
  let adapter: any;
  let bus: MessageBus;

  beforeEach(async () => {
    vi.clearAllMocks();
    MockWebSocket.lastInstance = null;

    mockExecSync.mockReturnValue(Buffer.from('signal-cli-rest-api'));
    // /v1/about returns json-rpc mode
    mockFetch.mockResolvedValue(aboutResponse('json-rpc'));

    const mod = await import('@src/channels/signal.js');
    SignalAdapter = mod.SignalAdapter;
    bus = new MessageBus();
    adapter = new SignalAdapter({ phoneNumber: '+1234567890', apiPort: 8080 });
  });

  afterEach(async () => {
    await adapter?.stop?.();
  });

  it('initial status is disconnected', () => {
    expect(adapter.status()).toBe('disconnected');
  });

  it('reports error if Docker is not running', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('Docker not running'); });
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    expect(adapter.status()).toBe('error');
  });

  it('connects and opens a WebSocket in json-rpc mode', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    // Flush the Promise.resolve() in MockWebSocket constructor
    await Promise.resolve();

    expect(adapter.status()).toBe('connected');
    expect(MockWebSocket.lastInstance).not.toBeNull();
    expect(MockWebSocket.lastInstance!.url).toContain('/v1/receive/');
    expect(MockWebSocket.lastInstance!.url).toContain('%2B1234567890');
  });

  it('incoming dataMessage from another user is emitted on bus', async () => {
    const received: any[] = [];
    bus.onMessage((m) => received.push(m));

    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve(); // let WS open

    MockWebSocket.lastInstance!.simulateMessage(
      makeDataMessage('+1987654321', 'Hello from Signal')
    );

    expect(received).toHaveLength(1);
    expect(received[0].channelType).toBe('signal');
    expect(received[0].content).toBe('Hello from Signal');
    expect(received[0].peerId).toBe('+1987654321');
  });

  it('dataMessage from own number is ignored (not self-chat)', async () => {
    const received: any[] = [];
    bus.onMessage((m) => received.push(m));

    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve();

    MockWebSocket.lastInstance!.simulateMessage(
      makeDataMessage('+1234567890', 'Echo of my own send')
    );

    expect(received).toHaveLength(0);
  });

  it('syncMessage (note-to-self) is emitted on bus', async () => {
    const received: any[] = [];
    bus.onMessage((m) => received.push(m));

    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve();

    MockWebSocket.lastInstance!.simulateMessage(
      makeSyncMessage('+1234567890', '+1234567890', 'Note to self')
    );

    expect(received).toHaveLength(1);
    expect(received[0].channelType).toBe('signal');
    expect(received[0].content).toBe('Note to self');
    expect(received[0].peerId).toBe('+1234567890');
  });

  it('receipt and typing envelopes (no dataMessage or syncMessage) are ignored', async () => {
    const received: any[] = [];
    bus.onMessage((m) => received.push(m));

    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve();

    MockWebSocket.lastInstance!.simulateMessage({
      envelope: { source: '+1987654321', sourceNumber: '+1987654321', receiptMessage: {} },
    });
    MockWebSocket.lastInstance!.simulateMessage({
      envelope: { source: '+1987654321', sourceNumber: '+1987654321', typingMessage: {} },
    });

    expect(received).toHaveLength(0);
  });

  it('WebSocket reconnects after close', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve();

    const first = MockWebSocket.lastInstance!;
    first.close(); // simulate server closing the connection
    await new Promise(r => setTimeout(r, 3100)); // WS_RECONNECT_DELAY_MS = 3000

    expect(MockWebSocket.lastInstance).not.toBe(first);
    expect(MockWebSocket.lastInstance!.url).toContain('/v1/receive/');
  });

  it('stop() closes WebSocket and sets status to disconnected', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve();

    const ws = MockWebSocket.lastInstance!;
    await adapter.stop();

    expect(adapter.status()).toBe('disconnected');
    expect(ws.closed).toBe(true);
  });

  it('stop() prevents WebSocket reconnect', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve();

    const first = MockWebSocket.lastInstance!;
    await adapter.stop();
    await new Promise(r => setTimeout(r, 3100));

    // No new instance created after stop
    expect(MockWebSocket.lastInstance).toBe(first);
  });
});

// ─── normal mode (HTTP polling) ───────────────────────────────────────────────

describe('SignalAdapter — normal mode (HTTP polling)', () => {
  let SignalAdapter: any;
  let adapter: any;
  let bus: MessageBus;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    MockWebSocket.lastInstance = null;

    mockExecSync.mockReturnValue(Buffer.from('signal-cli-rest-api'));
    // /v1/about returns normal mode → adapter uses HTTP polling
    mockFetch.mockResolvedValue(aboutResponse('normal'));

    const mod = await import('@src/channels/signal.js');
    SignalAdapter = mod.SignalAdapter;
    bus = new MessageBus();
    adapter = new SignalAdapter({ phoneNumber: '+1234567890', apiPort: 8080, pollInterval: 1000 });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await adapter?.stop?.();
  });

  it('connects and starts HTTP polling in normal mode', async () => {
    mockFetch
      .mockResolvedValueOnce(aboutResponse('normal'))
      .mockResolvedValue({ ok: true, json: async () => [] });

    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    expect(adapter.status()).toBe('connected');
    expect(MockWebSocket.lastInstance).toBeNull(); // no WS opened
  });

  it('polls GET /v1/receive and emits incoming dataMessages', async () => {
    const received: any[] = [];
    bus.onMessage((m) => received.push(m));

    const msg = makeDataMessage('+1987654321', 'Hello via poll');

    mockFetch
      .mockResolvedValueOnce(aboutResponse('normal'))       // /v1/about
      .mockResolvedValueOnce({ ok: true, json: async () => [msg] }) // first poll
      .mockResolvedValue({ ok: true, json: async () => [] });

    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await vi.advanceTimersByTimeAsync(1100);

    expect(received).toHaveLength(1);
    expect(received[0].content).toBe('Hello via poll');
  });

  it('own dataMessages are ignored in normal mode too', async () => {
    const received: any[] = [];
    bus.onMessage((m) => received.push(m));

    const ownMsg = makeDataMessage('+1234567890', 'My own echo');

    mockFetch
      .mockResolvedValueOnce(aboutResponse('normal'))
      .mockResolvedValueOnce({ ok: true, json: async () => [ownMsg] })
      .mockResolvedValue({ ok: true, json: async () => [] });

    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await vi.advanceTimersByTimeAsync(1100);

    expect(received).toHaveLength(0);
  });

  it('stop() halts polling', async () => {
    mockFetch
      .mockResolvedValueOnce(aboutResponse('normal'))
      .mockResolvedValue({ ok: true, json: async () => [] });

    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await adapter.stop();

    expect(adapter.status()).toBe('disconnected');
    expect((adapter as any)._pollTimer).toBeNull();
  });
});

// ─── Send ─────────────────────────────────────────────────────────────────────

describe('SignalAdapter — send', () => {
  let SignalAdapter: any;
  let adapter: any;
  let bus: MessageBus;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockExecSync.mockReturnValue(Buffer.from('signal-cli-rest-api'));
    mockFetch.mockResolvedValue(aboutResponse('normal'));

    const mod = await import('@src/channels/signal.js');
    SignalAdapter = mod.SignalAdapter;
    bus = new MessageBus();
    adapter = new SignalAdapter({ phoneNumber: '+1234567890', apiPort: 8080 });

    mockFetch
      .mockResolvedValueOnce(aboutResponse('normal'))
      .mockResolvedValue(makeSendResponse());

    await adapter.init({ enabled: true }, bus);
    await adapter.start();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await adapter?.stop?.();
  });

  it('short message sent via POST /v2/send with correct payload', async () => {
    await adapter.send('+1987654321', { type: 'text', text: 'Hello Signal' });

    const sendCall = mockFetch.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/v2/send')
    );
    expect(sendCall).toBeDefined();
    const body = JSON.parse(sendCall![1].body);
    expect(body.message).toBe('Hello Signal');
    expect(body.number).toBe('+1234567890');
    expect(body.recipients).toContain('+1987654321');
  });

  it('message longer than 4096 chars is split into multiple sends', async () => {
    const longText = 'A'.repeat(4097);
    const sendPromise = adapter.send('+1987654321', { type: 'text', text: longText });
    await vi.advanceTimersByTimeAsync(500);
    await sendPromise;

    const sendCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/v2/send')
    );
    expect(sendCalls.length).toBeGreaterThan(1);
  });
});

// ─── detectSignalContainer ────────────────────────────────────────────────────

describe('detectSignalContainer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when container is running', async () => {
    mockExecSync.mockReturnValue(Buffer.from('signal-cli-rest-api'));
    const { detectSignalContainer } = await import('@src/channels/signal.js');
    expect(detectSignalContainer()).toBe(true);
  });

  it('returns false when container is not running', async () => {
    mockExecSync.mockReturnValue(Buffer.from(''));
    const { detectSignalContainer } = await import('@src/channels/signal.js');
    expect(detectSignalContainer()).toBe(false);
  });
});
