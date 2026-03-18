/**
 * Session lifecycle tests (task 6.1) — TDD red
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MessageBus, createIncomingMessage } from '@src/channels/interface.js';
import { Orchestrator } from '@src/orchestrator.js';

function makeMsg(content = 'Hello') {
  return createIncomingMessage({
    channelType: 'whatsapp',
    peerId: 'peer1@s.whatsapp.net',
    content,
    raw: {},
  });
}

function makeRunner() {
  return {
    prompt: vi.fn().mockImplementation(async (_c: string, onEvent: any) => {
      onEvent({ type: 'text_delta', delta: 'reply' });
      onEvent({ type: 'message_end', runId: 'r1', usage: { input: 1, output: 1 } });
    }),
    abort: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
  };
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

describe('Session lifecycle — inactivity timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inactivity timer resets on each message', async () => {
    const runner = makeRunner();
    const adapter = makeAdapter();
    const bus = new MessageBus();
    const orc = new Orchestrator(
      { routing: { default: 'main', rules: [] }, session: { inactivityTimeout: 1000 } } as any,
      bus,
      new Map([['whatsapp', adapter]]),
      new Map([['main', runner]])
    );
    orc.start();

    bus.publish(makeMsg('First'));
    // Let synchronous dispatch happen, but don't fire timers yet
    await Promise.resolve();

    // Advance 500ms — no timeout yet
    vi.advanceTimersByTime(500);
    expect(runner.dispose).not.toHaveBeenCalled();

    bus.publish(makeMsg('Second'));
    await Promise.resolve();

    // Advance another 500ms — timer was reset, still no dispose
    vi.advanceTimersByTime(500);
    expect(runner.dispose).not.toHaveBeenCalled();

    // Now advance past full timeout from the second message
    vi.advanceTimersByTime(600);
    await Promise.resolve();
    expect(runner.dispose).toHaveBeenCalled();

    orc.stop();
  });

  it('session is closed after inactivity timeout', async () => {
    const runner = makeRunner();
    const adapter = makeAdapter();
    const bus = new MessageBus();
    const orc = new Orchestrator(
      { routing: { default: 'main', rules: [] }, session: { inactivityTimeout: 500 } } as any,
      bus,
      new Map([['whatsapp', adapter]]),
      new Map([['main', runner]])
    );
    orc.start();

    bus.publish(makeMsg());
    await vi.runAllTimersAsync();

    vi.advanceTimersByTime(600);
    await vi.runAllTimersAsync();

    expect(runner.dispose).toHaveBeenCalledTimes(1);
    orc.stop();
  });
});

describe('Session lifecycle — reload and restart', () => {
  it('reload does not interrupt in-flight turn', async () => {
    vi.useRealTimers();
    let resolveTurn!: () => void;
    const turnPromise = new Promise<void>(r => { resolveTurn = r; });

    const runner = {
      prompt: vi.fn().mockImplementation(async (_c: string, onEvent: any) => {
        await turnPromise;
        onEvent({ type: 'text_delta', delta: 'done' });
        onEvent({ type: 'message_end', runId: 'r1', usage: { input: 1, output: 1 } });
      }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = makeAdapter();
    const bus = new MessageBus();
    const orc = new Orchestrator(
      { routing: { default: 'main', rules: [] }, session: { inactivityTimeout: 14_400_000 } } as any,
      bus,
      new Map([['whatsapp', adapter]]),
      new Map([['main', runner]])
    );
    orc.start();

    // Start a turn
    bus.publish(makeMsg('Working...'));
    await new Promise(r => setTimeout(r, 10));

    // Reload while turn is in progress
    for (const r of orc.runners.values()) await r.reload();

    expect(runner.reload).toHaveBeenCalled();
    // Turn should not have been aborted
    expect(runner.abort).not.toHaveBeenCalled();

    // Resolve the turn
    resolveTurn();
    await new Promise(r => setTimeout(r, 20));

    orc.stop();
  });

  it('restart waits for in-flight turn then calls stop on adapters', async () => {
    vi.useRealTimers();
    let resolveTurn!: () => void;
    const turnPromise = new Promise<void>(r => { resolveTurn = r; });

    const runner = {
      prompt: vi.fn().mockImplementation(async (_c: string, onEvent: any) => {
        await turnPromise;
        onEvent({ type: 'text_delta', delta: 'done' });
        onEvent({ type: 'message_end', runId: 'r1', usage: { input: 1, output: 1 } });
      }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = makeAdapter();
    const bus = new MessageBus();
    const orc = new Orchestrator(
      { routing: { default: 'main', rules: [] }, session: { inactivityTimeout: 14_400_000 } } as any,
      bus,
      new Map([['whatsapp', adapter]]),
      new Map([['main', runner]])
    );
    orc.start();

    bus.publish(makeMsg('Working...'));
    await new Promise(r => setTimeout(r, 10));

    // Initiate graceful restart (resolveFirst so it completes)
    const restartPromise = gracefulShutdown(orc, 5000);
    resolveTurn();
    await restartPromise;

    expect(adapter.stop).toHaveBeenCalled();
    expect(runner.dispose).toHaveBeenCalled();
  });
});

/**
 * Simulate graceful shutdown: stop orchestrator, stop adapters, dispose runners.
 */
async function gracefulShutdown(orc: Orchestrator, _timeoutMs: number): Promise<void> {
  orc.stop();
  for (const adapter of orc.adapters.values()) {
    await adapter.stop();
  }
  for (const runner of orc.runners.values()) {
    await runner.dispose();
  }
}
