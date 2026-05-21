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

  it('markRead is called on incoming messages before bus publish (json-rpc)', async () => {
    const callOrder: string[] = [];

    // Track receipts calls
    let receiptsCalled = false;
    mockFetch.mockImplementation((...args: any[]) => {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url ?? '';
      if (url.includes('/v1/receipts')) {
        callOrder.push('receipts');
        receiptsCalled = true;
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      // Default: return json-rpc about response for the setup
      if (url.includes('/v1/about')) {
        return Promise.resolve(aboutResponse('json-rpc'));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const origPublish = bus.publish.bind(bus);
    bus.publish = ((msg: any) => {
      callOrder.push('publish');
      origPublish(msg);
    }) as any;

    const { SignalAdapter: SA } = await import('@src/channels/signal.js');
    const testAdapter = new SA({ phoneNumber: '+1234567890', apiPort: 8080 });
    await testAdapter.init({ enabled: true }, bus);
    await testAdapter.start();
    await Promise.resolve();

    MockWebSocket.lastInstance!.simulateMessage(
      makeDataMessage('+15559876543', 'Hello from Signal')
    );

    expect(receiptsCalled).toBe(true);
    expect(callOrder.indexOf('receipts')).toBeLessThan(callOrder.indexOf('publish'));

    await testAdapter.stop();
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

  it('startTyping sends PUT to typing-indicator endpoint', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve();

    const incomingMsg = {
      channelType: 'signal' as const,
      peerId: '+15559876543',
      content: 'Hello',
      timestamp: Date.now(),
      raw: {},
    };

    await adapter.startTyping(incomingMsg);

    const typingCall = mockFetch.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/v1/typing-indicator')
    );
    expect(typingCall).toBeDefined();
    expect(typingCall![1].method).toBe('PUT');
    const body = JSON.parse(typingCall![1].body as string);
    expect(body.recipient).toBe('+15559876543');
    expect(typingCall![0]).toContain('%2B1234567890'); // encoded own number
  });

  it('stopTyping sends DELETE to typing-indicator endpoint', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve();

    const incomingMsg = {
      channelType: 'signal' as const,
      peerId: '+15559876543',
      content: 'Hello',
      timestamp: Date.now(),
      raw: {},
    };

    await adapter.stopTyping(incomingMsg);

    const typingCall = mockFetch.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/v1/typing-indicator')
    );
    expect(typingCall).toBeDefined();
    expect(typingCall![1].method).toBe('DELETE');
    const body = JSON.parse(typingCall![1].body as string);
    expect(body.recipient).toBe('+15559876543');
  });

  it('markRead posts a read receipt with correct body (PF-3-A)', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve();

    // Signal-cli expects timestamps in milliseconds (Java System.currentTimeMillis()).
    // IncomingMessage.timestamp is already in ms — must be sent without conversion.
    const msgTimestampMs = 1700000000000;
    const incomingMsg = {
      channelType: 'signal' as const,
      peerId: '+15559876543',
      content: 'Hello',
      timestamp: msgTimestampMs,
      raw: {},
    };

    await adapter.markRead(incomingMsg);

    const receiptCall = mockFetch.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/v1/receipts')
    );
    expect(receiptCall).toBeDefined();
    expect(receiptCall![1].method).toBe('POST');
    const body = JSON.parse(receiptCall![1].body as string);
    expect(body.recipient).toBe('+15559876543');
    expect(body.receipt_type).toBe('read');
    expect(body.timestamp).toBe(msgTimestampMs);
    expect(receiptCall![0]).toContain('%2B1234567890'); // encoded own number
  });

  it('presence errors do not propagate', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve();

    // Make all fetch calls fail
    mockFetch.mockRejectedValue(new Error('network error'));

    const incomingMsg = {
      channelType: 'signal' as const,
      peerId: '+15559876543',
      content: 'Hello',
      timestamp: Date.now(),
      raw: {},
    };

    await expect(adapter.startTyping(incomingMsg)).resolves.toBeUndefined();
    await expect(adapter.stopTyping(incomingMsg)).resolves.toBeUndefined();
    await expect(adapter.markRead(incomingMsg)).resolves.toBeUndefined();
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

  it('markRead is called on incoming messages before bus publish (normal mode / HTTP polling) — PF-3-F', async () => {
    const callOrder: string[] = [];

    const msg = makeDataMessage('+1987654321', 'Hello via poll');

    mockFetch.mockImplementation((...args: any[]) => {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url ?? '';
      if (url.includes('/v1/about')) {
        return Promise.resolve(aboutResponse('normal'));
      }
      if (url.includes('/v1/receipts')) {
        callOrder.push('receipts');
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url.includes('/v1/receive')) {
        // First poll returns one message; subsequent polls return empty
        if (!callOrder.includes('polled')) {
          callOrder.push('polled');
          return Promise.resolve({ ok: true, json: async () => [msg] });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    const origPublish = bus.publish.bind(bus);
    bus.publish = ((m: any) => {
      callOrder.push('publish');
      origPublish(m);
    }) as any;

    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await vi.advanceTimersByTimeAsync(1100);

    expect(callOrder).toContain('receipts');
    expect(callOrder).toContain('publish');
    expect(callOrder.indexOf('receipts')).toBeLessThan(callOrder.indexOf('publish'));
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

// ─── syncMessage self-destination filter ────────────────────────────────────

describe('SignalAdapter — syncMessage self-destination filter', () => {
  let SignalAdapter: any;
  let adapter: any;
  let bus: MessageBus;

  beforeEach(async () => {
    vi.clearAllMocks();
    MockWebSocket.lastInstance = null;
    mockExecSync.mockReturnValue(Buffer.from('signal-cli-rest-api'));
    mockFetch.mockResolvedValue(aboutResponse('json-rpc'));
    const mod = await import('@src/channels/signal.js');
    SignalAdapter = mod.SignalAdapter;
    bus = new MessageBus();
    adapter = new SignalAdapter({ phoneNumber: '+1234567890', apiPort: 8080 });
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve();
  });

  afterEach(async () => { await adapter?.stop?.(); });

  it('syncMessage to own number (note-to-self) is published to bus', async () => {
    const received: any[] = [];
    bus.onMessage((m) => received.push(m));
    MockWebSocket.lastInstance!.simulateMessage(
      makeSyncMessage('+1234567890', '+1234567890', 'note to self')
    );
    expect(received).toHaveLength(1);
    expect(received[0].content).toBe('note to self');
  });

  it('syncMessage to a third party is NOT published to bus', async () => {
    const received: any[] = [];
    bus.onMessage((m) => received.push(m));
    MockWebSocket.lastInstance!.simulateMessage(
      makeSyncMessage('+1234567890', '+1987654321', 'message to someone else')
    );
    expect(received).toHaveLength(0);
  });
});

// ─── echo deduplication ───────────────────────────────────────────────────────────

describe('SignalAdapter — echo deduplication', () => {
  let SignalAdapter: any;
  let adapter: any;
  let bus: MessageBus;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    MockWebSocket.lastInstance = null;
    mockExecSync.mockReturnValue(Buffer.from('signal-cli-rest-api'));
    mockFetch
      .mockResolvedValueOnce(aboutResponse('json-rpc'))
      .mockResolvedValue(makeSendResponse());
    const mod = await import('@src/channels/signal.js');
    SignalAdapter = mod.SignalAdapter;
    bus = new MessageBus();
    adapter = new SignalAdapter({ phoneNumber: '+1234567890', apiPort: 8080 });
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await adapter?.stop?.();
  });

  it('syncMessage echo of a sent message is suppressed', async () => {
    const received: any[] = [];
    bus.onMessage((m) => received.push(m));

    // Adapter sends a message
    await adapter.send('+1234567890', { type: 'text', text: 'agent reply' });

    // Transport echoes it back as a syncMessage (note-to-self)
    MockWebSocket.lastInstance!.simulateMessage(
      makeSyncMessage('+1234567890', '+1234567890', 'agent reply')
    );

    expect(received).toHaveLength(0);
  });

  it('genuine note-to-self (no prior send) is NOT suppressed', async () => {
    const received: any[] = [];
    bus.onMessage((m) => received.push(m));

    // No send — just an incoming note-to-self typed by the user
    MockWebSocket.lastInstance!.simulateMessage(
      makeSyncMessage('+1234567890', '+1234567890', 'user typed this')
    );

    expect(received).toHaveLength(1);
    expect(received[0].content).toBe('user typed this');
  });

  it('dedup token expires after TTL and message is accepted again', async () => {
    const received: any[] = [];
    bus.onMessage((m) => received.push(m));

    await adapter.send('+1234567890', { type: 'text', text: 'agent reply' });

    // Advance past 10s TTL
    await vi.advanceTimersByTimeAsync(11_000);

    MockWebSocket.lastInstance!.simulateMessage(
      makeSyncMessage('+1234567890', '+1234567890', 'agent reply')
    );

    // After TTL expired, same text from same peer is accepted
    expect(received).toHaveLength(1);
  });
});

// ─── send() status guard ────────────────────────────────────────────────────

describe('SignalAdapter — send() status guard', () => {
  let SignalAdapter: any;
  let adapter: any;
  let bus: MessageBus;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecSync.mockReturnValue(Buffer.from('signal-cli-rest-api'));
    mockFetch.mockResolvedValue(aboutResponse('normal'));
    const mod = await import('@src/channels/signal.js');
    SignalAdapter = mod.SignalAdapter;
    bus = new MessageBus();
    adapter = new SignalAdapter({ phoneNumber: '+1234567890', apiPort: 8080 });
  });

  it('markRead is a no-op when adapter is not connected', async () => {
    await adapter.init({ enabled: true }, bus);
    // NOT started — status() is still 'disconnected'
    mockFetch.mockClear();

    const incomingMsg = {
      channelType: 'signal' as const,
      peerId: '+15559876543',
      content: 'Hello',
      timestamp: Date.now(),
      raw: {},
    };

    // Should resolve without throwing
    await expect(adapter.markRead(incomingMsg)).resolves.toBeUndefined();

    // No HTTP request should have been made
    const receiptCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/v1/receipts')
    );
    expect(receiptCalls).toHaveLength(0);
  });

  it('send() returns without throwing when adapter is not started', async () => {
    await adapter.init({ enabled: true }, bus);
    // NOT started — status is still 'disconnected'
    mockFetch.mockClear();
    await expect(adapter.send('+1987654321', { type: 'text', text: 'hello' })).resolves.toBeUndefined();
    // No HTTP call should have been made
    const sendCalls = mockFetch.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('/v2/send')
    );
    expect(sendCalls).toHaveLength(0);
  });
});

// ─── observability logging ───────────────────────────────────────────────────

describe('SignalAdapter — observability logging', () => {
  let SignalAdapter: any;
  let adapter: any;
  let bus: MessageBus;

  beforeEach(async () => {
    vi.clearAllMocks();
    MockWebSocket.lastInstance = null;
    mockExecSync.mockReturnValue(Buffer.from('signal-cli-rest-api'));
    mockFetch.mockResolvedValue(aboutResponse('json-rpc'));
    const mod = await import('@src/channels/signal.js');
    SignalAdapter = mod.SignalAdapter;
    bus = new MessageBus();
    adapter = new SignalAdapter({ phoneNumber: '+1234567890', apiPort: 8080 });
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    await Promise.resolve();
  });

  afterEach(async () => { await adapter?.stop?.(); });

  it('logs [Signal] Received message when a valid message is processed', async () => {
    const { getLogger } = await import('@src/observability/logger.js');
    const debugSpy = vi.spyOn(getLogger(), 'debug').mockImplementation((() => {}) as any);
    MockWebSocket.lastInstance!.simulateMessage(
      makeDataMessage('+1987654321', 'Hello')
    );
    expect(debugSpy.mock.calls.some((args: any[]) =>
      String(args[args.length - 1]).includes('[Signal] Received message')
    )).toBe(true);
    debugSpy.mockRestore();
  });

  it('logs [Signal] Skipping empty when envelope has no text', async () => {
    const { getLogger } = await import('@src/observability/logger.js');
    const debugSpy = vi.spyOn(getLogger(), 'debug').mockImplementation((() => {}) as any);
    MockWebSocket.lastInstance!.simulateMessage({
      envelope: {
        source: '+1987654321',
        sourceNumber: '+1987654321',
        dataMessage: { message: '' }, // empty text
      },
    });
    expect(debugSpy.mock.calls.some((args: any[]) =>
      String(args[args.length - 1]).includes('[Signal] Skipping empty')
    )).toBe(true);
    debugSpy.mockRestore();
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
