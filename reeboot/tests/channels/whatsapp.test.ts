/**
 * WhatsApp adapter tests (task 3.1) — TDD red
 *
 * Uses a mock of @whiskeysockets/baileys so no real connection is made.
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { EventEmitter } from 'events';
import { MessageBus } from '@src/channels/interface.js';

// ─── Baileys mock ─────────────────────────────────────────────────────────────

// Baileys v7 uses sock.ev (EventEmitter) for events, not the socket directly
const mockEv = new EventEmitter() as any;

const mockSocket = {
  ev: mockEv,
  sendMessage: vi.fn().mockResolvedValue({}),
  logout: vi.fn().mockResolvedValue({}),
  end: vi.fn(),
  user: { id: '40740025025:0@s.whatsapp.net', lid: '43624150659184:0@lid' },
} as any;

const mockMakeWASocket = vi.fn().mockReturnValue(mockSocket);
const mockUseMultiFileAuthState = vi.fn().mockResolvedValue({
  state: { creds: {}, keys: {} },
  saveCreds: vi.fn(),
});
const mockDisconnectReasonEnum = { loggedOut: 401 };

vi.mock('@whiskeysockets/baileys', () => ({
  default: mockMakeWASocket,
  makeWASocket: mockMakeWASocket,
  useMultiFileAuthState: mockUseMultiFileAuthState,
  DisconnectReason: mockDisconnectReasonEnum,
  Browsers: { ubuntu: () => ['Ubuntu', 'Chrome', '20.0.0'] },
  fetchLatestWaWebVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 1027934701] }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WhatsAppAdapter', () => {
  let adapter: any;
  let bus: MessageBus;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset mockEv listeners
    mockEv.removeAllListeners();
    mockSocket.sendMessage = vi.fn().mockResolvedValue({});

    // Provide a temp auth dir
    const { WhatsAppAdapter } = await import('@src/channels/whatsapp.js');
    bus = new MessageBus();
    adapter = new WhatsAppAdapter('/tmp/test-wa-auth');
  });

  it('init sets up adapter with bus and config', async () => {
    await adapter.init({ enabled: true }, bus);
    expect(adapter.status()).toBe('initializing');
  });

  it('start calls makeWASocket with auth state', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    expect(mockMakeWASocket).toHaveBeenCalledWith(
      expect.objectContaining({ auth: expect.anything() })
    );
  });

  it('saved auth state is loaded without QR (useMultiFileAuthState called)', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    expect(mockUseMultiFileAuthState).toHaveBeenCalledWith('/tmp/test-wa-auth');
  });

  it('incoming text message is emitted on bus', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    const received: any[] = [];
    bus.onMessage((msg) => received.push(msg));

    // Simulate Baileys messages.upsert event
    mockEv.emit('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { remoteJid: '1234@s.whatsapp.net', fromMe: false, id: 'msg1' },
          message: { conversation: 'Hello from WA' },
        },
      ],
    });

    expect(received).toHaveLength(1);
    expect(received[0].channelType).toBe('whatsapp');
    expect(received[0].peerId).toBe('1234@s.whatsapp.net');
    expect(received[0].content).toBe('Hello from WA');
  });

  it('own messages (fromMe=true) are ignored', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    const received: any[] = [];
    bus.onMessage((msg) => received.push(msg));

    mockEv.emit('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { remoteJid: '1234@s.whatsapp.net', fromMe: true, id: 'msg2' },
          message: { conversation: 'My own message' },
        },
      ],
    });

    expect(received).toHaveLength(0);
  });

  it('self-chat via own @lid (multi-device) is accepted', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    const received: any[] = [];
    bus.onMessage((msg) => received.push(msg));

    // fromMe=true but peerId matches sock.user.lid → self-chat
    mockEv.emit('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { remoteJid: '43624150659184@lid', fromMe: true, id: 'self1' },
          message: { conversation: 'Hello bot' },
        },
      ],
    });

    expect(received).toHaveLength(1);
    expect(received[0].content).toBe('Hello bot');
  });

  it('echo of sent message is skipped (sent ID tracked)', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    // Simulate connection open so status becomes 'connected' (required by send() status guard)
    mockEv.emit('connection.update', { connection: 'open' });

    mockSocket.sendMessage = vi.fn().mockResolvedValue({ key: { id: 'sent-abc' } });
    await adapter.send('43624150659184@lid', { type: 'text', text: 'Reply' });

    const received: any[] = [];
    bus.onMessage((msg) => received.push(msg));

    // Echo of our own sent message arrives
    mockEv.emit('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { remoteJid: '43624150659184@lid', fromMe: true, id: 'sent-abc' },
          message: { conversation: 'Reply' },
        },
      ],
    });

    expect(received).toHaveLength(0);
  });

  it('@lid fromMe=true with unknown lid is ignored (prevents echo loop)', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    const received: any[] = [];
    bus.onMessage((msg) => received.push(msg));

    // peerId does NOT match user's own lid
    mockEv.emit('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { remoteJid: '99999999999@lid', fromMe: true, id: 'echo1' },
          message: { conversation: 'Echoed outgoing message' },
        },
      ],
    });

    expect(received).toHaveLength(0);
  });

  it('append type messages are processed (retry/replay support)', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    const received: any[] = [];
    bus.onMessage((msg) => received.push(msg));

    mockEv.emit('messages.upsert', {
      type: 'append',
      messages: [
        {
          key: { remoteJid: '1234@s.whatsapp.net', fromMe: false, id: 'msg3' },
          message: { conversation: 'Retry replayed message' },
        },
      ],
    });

    expect(received).toHaveLength(1);
    expect(received[0].content).toBe('Retry replayed message');
  });

  it('unknown upsert types are ignored', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    const received: any[] = [];
    bus.onMessage((msg) => received.push(msg));

    mockEv.emit('messages.upsert', {
      type: 'history_sync',
      messages: [
        {
          key: { remoteJid: '1234@s.whatsapp.net', fromMe: false, id: 'msg4' },
          message: { conversation: 'Old history' },
        },
      ],
    });

    expect(received).toHaveLength(0);
  });

  it('short message sent as single sendMessage call', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    mockEv.emit('connection.update', { connection: 'open' });

    await adapter.send('1234@s.whatsapp.net', { type: 'text', text: 'Hello' });

    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockSocket.sendMessage).toHaveBeenCalledWith(
      '1234@s.whatsapp.net',
      { text: 'Hello' }
    );
  });

  it('long message (>4096 chars) is chunked into multiple sendMessage calls', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();
    mockEv.emit('connection.update', { connection: 'open' });

    const longText = 'A'.repeat(4097);
    await adapter.send('1234@s.whatsapp.net', { type: 'text', text: longText });

    expect(mockSocket.sendMessage.mock.calls.length).toBeGreaterThan(1);
  });

  it('non-logout disconnect triggers reconnect (makeWASocket called again)', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    const callsBefore = mockMakeWASocket.mock.calls.length;

    // Simulate non-logout disconnect
    const error = new Error('connection closed') as any;
    error.output = { statusCode: 428 }; // not loggedOut
    mockEv.emit('connection.update', { connection: 'close', lastDisconnect: { error } });

    // Small delay for async reconnect
    await new Promise(r => setTimeout(r, 10));

    expect(mockMakeWASocket.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('logout disconnect sets status to error and does not reconnect', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    const callsBefore = mockMakeWASocket.mock.calls.length;

    const error = new Error('logged out') as any;
    error.output = { statusCode: mockDisconnectReasonEnum.loggedOut };
    mockEv.emit('connection.update', { connection: 'close', lastDisconnect: { error } });

    await new Promise(r => setTimeout(r, 10));

    expect(adapter.status()).toBe('error');
    expect(mockMakeWASocket.mock.calls.length).toBe(callsBefore);
  });

  it('connection open sets status to connected', async () => {
    await adapter.init({ enabled: true }, bus);
    await adapter.start();

    mockEv.emit('connection.update', { connection: 'open' });

    expect(adapter.status()).toBe('connected');
  });
});
