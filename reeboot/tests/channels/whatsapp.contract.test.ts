/**
 * WhatsApp adapter — Tier 1 contract validation.
 */

import { describe, beforeEach, vi } from 'vitest';
import { runChannelContractTests } from './contract/runContractTests.js';
import type { Tier1Factory } from './contract/runContractTests.js';

// ─── Baileys mock (mirror whatsapp.test.ts setup) ─────────────────────────────

const mockSendMessage = vi.fn().mockResolvedValue({ key: { id: 'msg-id-1' } });
const mockEnd = vi.fn();
let connectionUpdateHandler: ((update: any) => void) | null = null;
let messagesUpsertHandler: ((data: any) => void) | null = null;

const mockSocket = {
  ev: {
    on: (event: string, handler: any) => {
      if (event === 'connection.update') connectionUpdateHandler = handler;
      if (event === 'messages.upsert') messagesUpsertHandler = handler;
    },
  },
  user: { id: '40700000001:0@s.whatsapp.net', lid: '99999:0@lid' },
  sendMessage: mockSendMessage,
  end: mockEnd,
};

vi.mock('@whiskeysockets/baileys', () => ({
  makeWASocket: vi.fn(() => mockSocket),
  useMultiFileAuthState: vi.fn().mockResolvedValue({
    state: {},
    saveCreds: vi.fn(),
  }),
  DisconnectReason: { loggedOut: 401 },
  Browsers: { ubuntu: () => ['Ubuntu', 'Chrome', '20.0.04'] },
  fetchLatestWaWebVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 0] }),
}));

vi.mock('qrcode-terminal', () => ({ default: { generate: vi.fn() } }));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, mkdirSync: vi.fn() };
});

// ─── Factory ──────────────────────────────────────────────────────────────────

let WhatsAppAdapterClass: any;

const whatsappFactory: Tier1Factory = (_bus) => {
  const adapter = new WhatsAppAdapterClass('/tmp/test-wa-auth');
  const ownJid = '40700000001@s.whatsapp.net';

  return {
    adapter,
    setup: async () => {
      // Start the adapter (sets up baileys event handlers via _connect())
      await adapter.start();
      // Simulate WA connection open so status becomes 'connected'
      if (connectionUpdateHandler) {
        await connectionUpdateHandler({ connection: 'open' });
      }
    },
    simulateInbound: ({ peerId, text, fromSelf }) => {
      // Directly inject via messages.upsert — adapter must be init'd first
      if (!messagesUpsertHandler) return;
      messagesUpsertHandler({
        type: 'notify',
        messages: [{
          key: { remoteJid: fromSelf ? ownJid : peerId, fromMe: fromSelf, id: 'inbound-msg' },
          message: { conversation: text },
        }],
      });
    },
    simulateEcho: (_peerId, text) => {
      // Record the sent ID so the adapter thinks it sent this message
      const adapter_ = adapter as any;
      adapter_._sentIds.add('echo-msg-id');
      // Then deliver it as a fromMe echo — should be suppressed
      if (!messagesUpsertHandler) return;
      messagesUpsertHandler({
        type: 'notify',
        messages: [{
          key: { remoteJid: ownJid, fromMe: true, id: 'echo-msg-id' },
          message: { conversation: text },
        }],
      });
    },
  };
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WhatsAppAdapter — Tier 1 contract', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    connectionUpdateHandler = null;
    messagesUpsertHandler = null;
    mockSendMessage.mockResolvedValue({ key: { id: 'msg-id-1' } });
    const mod = await import('@src/channels/whatsapp.js');
    WhatsAppAdapterClass = (mod as any).WhatsAppAdapter;
  });

  runChannelContractTests(whatsappFactory);
});
