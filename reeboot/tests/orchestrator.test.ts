/**
 * Orchestrator tests (task 4.1) — TDD red
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageBus, createIncomingMessage } from '@src/channels/interface.js';
import type { IncomingMessage } from '@src/channels/interface.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMsg(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return createIncomingMessage({
    channelType: 'whatsapp',
    peerId: 'peer1@s.whatsapp.net',
    content: 'Hello',
    raw: {},
    ...overrides,
  });
}

function makeConfig(overrides: any = {}) {
  return {
    routing: {
      default: 'main',
      rules: [],
    },
    session: {
      inactivityTimeout: 14_400_000,
    },
    ...overrides,
  } as any;
}

function makeRunner(responseText = 'Agent reply') {
  const runner = {
    prompt: vi.fn().mockImplementation(async (_content: string, onEvent: any) => {
      onEvent({ type: 'text_delta', delta: responseText });
      onEvent({ type: 'message_end', runId: 'r1', usage: { input: 10, output: 5 } });
    }),
    abort: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
  };
  return runner;
}

function makeAdapter() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue('connected'),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Orchestrator routing', () => {
  let bus: MessageBus;
  let adapter: ReturnType<typeof makeAdapter>;
  let runner: ReturnType<typeof makeRunner>;
  let Orchestrator: any;

  beforeEach(async () => {
    vi.resetModules();
    ({ Orchestrator } = await import('@src/orchestrator.js'));
    bus = new MessageBus();
    adapter = makeAdapter();
    runner = makeRunner();
  });

  it('dispatches to default context when no rules match', async () => {
    const runners = new Map([['main', runner]]);
    const adapters = new Map([['whatsapp', adapter]]);
    const orc = new Orchestrator(makeConfig(), bus, adapters, runners);
    orc.start();

    bus.publish(makeMsg());
    await new Promise(r => setTimeout(r, 20));

    expect(runner.prompt).toHaveBeenCalledWith('Hello', expect.any(Function));
  });

  it('peer match takes highest priority over channel match and default', async () => {
    const peerRunner = makeRunner('peer reply');
    const channelRunner = makeRunner('channel reply');
    const defaultRunner = makeRunner('default reply');

    const runners = new Map([
      ['peer-ctx', peerRunner],
      ['channel-ctx', channelRunner],
      ['main', defaultRunner],
    ]);

    const config = makeConfig({
      routing: {
        default: 'main',
        rules: [
          { peer: 'peer1@s.whatsapp.net', context: 'peer-ctx' },
          { channel: 'whatsapp', context: 'channel-ctx' },
        ],
      },
    });

    const orc = new Orchestrator(config, bus, new Map([['whatsapp', adapter]]), runners);
    orc.start();

    bus.publish(makeMsg({ peerId: 'peer1@s.whatsapp.net' }));
    await new Promise(r => setTimeout(r, 20));

    expect(peerRunner.prompt).toHaveBeenCalled();
    expect(channelRunner.prompt).not.toHaveBeenCalled();
    expect(defaultRunner.prompt).not.toHaveBeenCalled();
  });

  it('channel match used when no peer match', async () => {
    const channelRunner = makeRunner();
    const defaultRunner = makeRunner();

    const runners = new Map([
      ['channel-ctx', channelRunner],
      ['main', defaultRunner],
    ]);

    const config = makeConfig({
      routing: {
        default: 'main',
        rules: [
          { channel: 'whatsapp', context: 'channel-ctx' },
        ],
      },
    });

    const orc = new Orchestrator(config, bus, new Map([['whatsapp', adapter]]), runners);
    orc.start();

    bus.publish(makeMsg({ peerId: 'unknown@s.whatsapp.net' }));
    await new Promise(r => setTimeout(r, 20));

    expect(channelRunner.prompt).toHaveBeenCalled();
    expect(defaultRunner.prompt).not.toHaveBeenCalled();
  });

  it('response is sent back via originating channel adapter', async () => {
    const runners = new Map([['main', runner]]);
    const adapters = new Map([['whatsapp', adapter]]);
    const orc = new Orchestrator(makeConfig(), bus, adapters, runners);
    orc.start();

    bus.publish(makeMsg());
    await new Promise(r => setTimeout(r, 20));

    expect(adapter.send).toHaveBeenCalledWith(
      'peer1@s.whatsapp.net',
      { type: 'text', text: 'Agent reply' }
    );
  });

  it('busy context sends please-wait reply', async () => {
    // Make runner take a long time
    const slowRunner = {
      prompt: vi.fn().mockImplementation(() => new Promise(r => setTimeout(r, 500))),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const runners = new Map([['main', slowRunner]]);
    const adapters = new Map([['whatsapp', adapter]]);
    const orc = new Orchestrator(makeConfig(), bus, adapters, runners);
    orc.start();

    // First message starts the turn
    bus.publish(makeMsg({ content: 'First' }));
    await new Promise(r => setTimeout(r, 10));

    // Second message arrives while busy
    bus.publish(makeMsg({ content: 'Second' }));
    await new Promise(r => setTimeout(r, 10));

    expect(adapter.send).toHaveBeenCalledWith(
      'peer1@s.whatsapp.net',
      { type: 'text', text: "I'm still working on your last request. Please wait." }
    );
  });

  it('queue limit sends queue full reply', async () => {
    const slowRunner = {
      prompt: vi.fn().mockImplementation(() => new Promise(r => setTimeout(r, 500))),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const runners = new Map([['main', slowRunner]]);
    const adapters = new Map([['whatsapp', adapter]]);
    const orc = new Orchestrator(makeConfig(), bus, adapters, runners);
    orc.start();

    bus.publish(makeMsg({ content: 'First' }));
    await new Promise(r => setTimeout(r, 5));

    // Fill queue (max 5)
    for (let i = 0; i < 5; i++) {
      bus.publish(makeMsg({ content: `Queued ${i}` }));
    }
    await new Promise(r => setTimeout(r, 5));

    // This one exceeds the queue
    bus.publish(makeMsg({ content: 'Overflow' }));
    await new Promise(r => setTimeout(r, 10));

    const queueFullCall = adapter.send.mock.calls.find(
      (c: any[]) => c[1]?.text?.includes('queue full') || c[1]?.text?.includes('Queue full')
    );
    expect(queueFullCall).toBeDefined();
  });

  it('queued message is processed after turn completes', async () => {
    let resolveFirst!: () => void;
    const firstPromise = new Promise<void>(r => { resolveFirst = r; });

    const slowRunner = {
      prompt: vi.fn()
        .mockImplementationOnce(async (_c: string, onEvent: any) => {
          await firstPromise;
          onEvent({ type: 'text_delta', delta: 'First done' });
          onEvent({ type: 'message_end', runId: 'r1', usage: { input: 1, output: 1 } });
        })
        .mockImplementationOnce(async (_c: string, onEvent: any) => {
          onEvent({ type: 'text_delta', delta: 'Second done' });
          onEvent({ type: 'message_end', runId: 'r2', usage: { input: 1, output: 1 } });
        }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const runners = new Map([['main', slowRunner]]);
    const adapters = new Map([['whatsapp', adapter]]);
    const orc = new Orchestrator(makeConfig(), bus, adapters, runners);
    orc.start();

    bus.publish(makeMsg({ content: 'First' }));
    await new Promise(r => setTimeout(r, 10));

    bus.publish(makeMsg({ content: 'Second' }));
    await new Promise(r => setTimeout(r, 10));

    // Resolve first turn
    resolveFirst();
    await new Promise(r => setTimeout(r, 30));

    // Both turns should have been called
    expect(slowRunner.prompt).toHaveBeenCalledTimes(2);
  });
});
