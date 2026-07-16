/**
 * Cancel signal — proper turn abort via bus
 *
 * Verifies that IncomingMessage supports action: 'cancel', the orchestrator
 * detects it on busy contexts and calls runner.abort(), and idle contexts
 * ignore cancel silently.
 */

import { describe, it, expect, vi } from 'vitest';
import { createIncomingMessage, MessageBus } from '../src/channels/interface.js';
import { Orchestrator } from '../src/orchestrator.js';

describe('IncomingMessage — action: cancel field', () => {
  it('createIncomingMessage accepts action: cancel', () => {
    const msg = createIncomingMessage({
      channelType: 'web',
      peerId: 'test',
      content: '',
      raw: null,
      action: 'cancel',
    });
    expect(msg.action).toBe('cancel');
  });

  it('createIncomingMessage without action field leaves it undefined', () => {
    const msg = createIncomingMessage({
      channelType: 'web',
      peerId: 'test',
      content: 'hello',
      raw: null,
    });
    expect(msg.action).toBeUndefined();
  });
});

describe('Orchestrator — cancel handling', () => {
  it('calls runner.abort() when cancel arrives on busy context', async () => {
    const abortSpy = vi.fn();
    const runner = {
      prompt: vi.fn().mockImplementation(async () => {
        // Simulate a long-running turn — never resolves
        await new Promise(() => {});
      }),
      abort: abortSpy,
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const runners = new Map();
    runners.set('main', runner);

    const bus = new MessageBus();
    const adapters = new Map();

    const orchestrator = new Orchestrator(
      { routing: { default: 'main', rules: [] } },
      bus,
      adapters,
      runners,
    );
    orchestrator.start();

    // Publish a normal message to start a turn
    bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: 'p1',
      content: 'hello',
      raw: null,
    }));

    // Give the orchestrator a tick to dispatch
    await new Promise((r) => setTimeout(r, 20));

    // Publish a cancel message while the context is busy
    bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: 'p1',
      content: '',
      raw: null,
      action: 'cancel',
    }));

    // Give the orchestrator a tick to process the cancel
    await new Promise((r) => setTimeout(r, 20));

    expect(abortSpy).toHaveBeenCalledTimes(1);

    orchestrator.stop();
  });

  it('does NOT call runner.abort() when cancel arrives on idle context', async () => {
    const abortSpy = vi.fn();
    const runner = {
      prompt: vi.fn().mockResolvedValue(undefined),
      abort: abortSpy,
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const runners = new Map();
    runners.set('main', runner);

    const bus = new MessageBus();
    const adapters = new Map();

    const orchestrator = new Orchestrator(
      { routing: { default: 'main', rules: [] } },
      bus,
      adapters,
      runners,
    );
    orchestrator.start();

    // Publish a cancel on an idle context — nothing is running
    bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: 'p1',
      content: '',
      raw: null,
      action: 'cancel',
    }));

    await new Promise((r) => setTimeout(r, 20));

    expect(abortSpy).not.toHaveBeenCalled();

    orchestrator.stop();
  });

  it('does not queue cancel message when busy', async () => {
    const abortSpy = vi.fn();
    const runner = {
      prompt: vi.fn().mockImplementation(async () => {
        await new Promise(() => {});
      }),
      abort: abortSpy,
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const runners = new Map();
    runners.set('main', runner);

    const bus = new MessageBus();
    // Track publishes to detect BUSY_REPLY
    const adapters = new Map();
    const sendSpy = vi.fn().mockResolvedValue(undefined);
    adapters.set('web', { send: sendSpy });

    const orchestrator = new Orchestrator(
      { routing: { default: 'main', rules: [] } },
      bus,
      adapters,
      runners,
    );
    orchestrator.start();

    // Start a turn
    bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: 'p1',
      content: 'hello',
      raw: null,
    }));

    await new Promise((r) => setTimeout(r, 20));

    // Send cancel while busy
    sendSpy.mockClear();
    bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: 'p1',
      content: '',
      raw: null,
      action: 'cancel',
    }));

    await new Promise((r) => setTimeout(r, 20));

    // The orchestrator should NOT have sent BUSY_REPLY or QUEUE_FULL_REPLY
    // for the cancel message. It should have aborted instead.
    // sendSpy should not have been called with a busy/queue message.
    const busyReplyCalls = sendSpy.mock.calls.filter(
      (c: any[]) => c[1]?.type !== undefined
    );
    // The cancel is silently consumed — no reply sent
    expect(busyReplyCalls.length).toBe(0);

    orchestrator.stop();
  });
});
