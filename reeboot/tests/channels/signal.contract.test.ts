/**
 * Signal adapter — Tier 1 contract validation.
 *
 * Runs the shared contract suite against the real SignalAdapter
 * backed by a mock transport (no Docker, no real network).
 */

import { describe, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { runChannelContractTests } from './contract/runContractTests.js';
import type { Tier1Factory } from './contract/runContractTests.js';
import { MessageBus } from '@src/channels/interface.js';

// ─── Mocks (mirror signal.test.ts setup) ─────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
  execSync: mockExecSync,
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: Buffer.from('') }),
}));

class MockWebSocket extends EventEmitter {
  static lastInstance: MockWebSocket | null = null;
  url: string;
  closed = false;
  constructor(url: string) {
    super();
    this.url = url;
    MockWebSocket.lastInstance = this;
    Promise.resolve().then(() => this.emit('open'));
  }
  close() { this.closed = true; this.emit('close', 1000, Buffer.from('')); }
  simulateMessage(data: object) {
    this.emit('message', Buffer.from(JSON.stringify(data)));
  }
}

vi.mock('ws', () => ({ WebSocket: MockWebSocket }));

// ─── Factory ──────────────────────────────────────────────────────────────────

let SignalAdapterClass: any;

const signalFactory: Tier1Factory = (_bus) => {
  mockExecSync.mockReturnValue(Buffer.from('signal-cli-rest-api'));
  mockFetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ mode: 'json-rpc' }) })
    .mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });

  const adapter = new SignalAdapterClass({ phoneNumber: '+1234567890', apiPort: 8080 });

  return {
    adapter,
    simulateInbound: ({ peerId, text, fromSelf }) => {
      // Bypass WS transport — directly call the internal handler.
      // The factory is adapter-aware by design.
      const ownNumber = '+1234567890';
      const rawMsg = fromSelf
        ? {
            envelope: {
              source: ownNumber, sourceNumber: ownNumber,
              // destination must be the adapter's own number to pass self-dest filter
              syncMessage: { sentMessage: { destination: ownNumber, destinationNumber: ownNumber, message: text } },
            },
          }
        : {
            envelope: { source: peerId, sourceNumber: peerId, dataMessage: { message: text } },
          };
      (adapter as any)._handleIncomingMessage(rawMsg);
    },
    simulateEcho: (_peerId, text) => {
      const ownNumber = '+1234567890';
      // 1. Record the sent key as if send() was called
      const key = `${ownNumber}::${text.slice(0, 64)}`;
      (adapter as any)._sentKeys.add(key);
      // 2. Deliver the echo back to self
      (adapter as any)._handleIncomingMessage({
        envelope: {
          source: ownNumber, sourceNumber: ownNumber,
          syncMessage: { sentMessage: { destination: ownNumber, destinationNumber: ownNumber, message: text } },
        },
      });
    },
  };
};

describe('SignalAdapter — Tier 1 contract', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    MockWebSocket.lastInstance = null;
    const mod = await import('@src/channels/signal.js');
    SignalAdapterClass = (mod as any).SignalAdapter;
  });

  runChannelContractTests(signalFactory);
});
