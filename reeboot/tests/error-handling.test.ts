/**
 * Error handling tests (task 8.1) — TDD red
 *
 * Tests rate-limit retry, turn timeout, and disk-full pre-check.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageBus, createIncomingMessage } from '@src/channels/interface.js';
import type { IncomingMessage } from '@src/channels/interface.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMsg(content = 'Hello', overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return createIncomingMessage({
    channelType: 'whatsapp',
    peerId: 'peer1',
    content,
    raw: {},
    ...overrides,
  });
}

function makeAdapter() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    init: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    status: vi.fn().mockReturnValue('connected'),
    connectedAt: vi.fn().mockReturnValue(null),
  };
}

// ─── Rate-limit retry tests ───────────────────────────────────────────────────

describe('Orchestrator rate-limit handling', () => {
  let bus: MessageBus;
  let adapter: ReturnType<typeof makeAdapter>;
  let Orchestrator: any;

  beforeEach(async () => {
    vi.resetModules();
    ({ Orchestrator } = await import('@src/orchestrator.js'));
    bus = new MessageBus();
    adapter = makeAdapter();
  });

  it('rate-limit error notifies user with retry message', async () => {
    vi.useFakeTimers();
    try {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;

      let callCount = 0;
      const runner = {
        prompt: vi.fn().mockImplementation(async (_c: string, onEvent: any) => {
          callCount++;
          if (callCount === 1) {
            throw rateLimitError;
          }
          onEvent({ type: 'text_delta', delta: 'Success on retry' });
          onEvent({ type: 'message_end', runId: 'r1', usage: { input: 1, output: 1 } });
        }),
        abort: vi.fn(),
        dispose: vi.fn().mockResolvedValue(undefined),
        reload: vi.fn().mockResolvedValue(undefined),
      };

      const orc = new Orchestrator(
        {
          routing: { default: 'main', rules: [] },
          session: { inactivityTimeout: 14_400_000 },
          agent: { turnTimeout: 300_000, rateLimitRetries: 1, _testBackoffMs: 5 }, // 1 retry, 10ms delay
        },
        bus,
        new Map([['whatsapp', adapter]]),
        new Map([['main', runner]])
      );
      orc.start();

      bus.publish(makeMsg('Test rate limit'));

      // Fire the retry-backoff timers deterministically
      await vi.advanceTimersByTimeAsync(500);

      // User should have been notified about rate limit
      const rateNotify = adapter.send.mock.calls.find(
        (c: any[]) => c[1]?.text?.toLowerCase().includes('rate limit') ||
                      c[1]?.text?.toLowerCase().includes('rate limited')
      );
      expect(rateNotify).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rate-limit retry eventually sends success response', async () => {
    vi.useFakeTimers();
    try {
      const rateLimitError = new Error('Rate limited');
      (rateLimitError as any).status = 429;

      let callCount = 0;
      const runner = {
        prompt: vi.fn().mockImplementation(async (_c: string, onEvent: any) => {
          callCount++;
          if (callCount <= 1) throw rateLimitError;
          onEvent({ type: 'text_delta', delta: 'Retry succeeded' });
          onEvent({ type: 'message_end', runId: 'r1', usage: { input: 1, output: 1 } });
        }),
        abort: vi.fn(),
        dispose: vi.fn().mockResolvedValue(undefined),
        reload: vi.fn().mockResolvedValue(undefined),
      };

      const orc = new Orchestrator(
        {
          routing: { default: 'main', rules: [] },
          session: { inactivityTimeout: 14_400_000 },
          agent: { turnTimeout: 300_000, rateLimitRetries: 2, _testBackoffMs: 5 },
        },
        bus,
        new Map([['whatsapp', adapter]]),
        new Map([['main', runner]])
      );
      orc.start();

      bus.publish(makeMsg());

      // Fire the retry-backoff timers deterministically
      await vi.advanceTimersByTimeAsync(500);

      // Eventually the response text should be sent
      const successCall = adapter.send.mock.calls.find(
        (c: any[]) => c[1]?.text === 'Retry succeeded'
      );
      expect(successCall).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── Turn timeout tests ───────────────────────────────────────────────────────

describe('Orchestrator turn timeout', () => {
  let bus: MessageBus;
  let adapter: ReturnType<typeof makeAdapter>;
  let Orchestrator: any;

  beforeEach(async () => {
    vi.resetModules();
    ({ Orchestrator } = await import('@src/orchestrator.js'));
    bus = new MessageBus();
    adapter = makeAdapter();
  });

  it('turn timeout calls runner.abort() and notifies user', async () => {
    vi.useFakeTimers();
    try {
      let runResolve: (() => void) | null = null;

      const runner = {
        prompt: vi.fn().mockImplementation(async () => {
          // "Hang" until externally resolved
          await new Promise<void>(r => { runResolve = r; });
        }),
        abort: vi.fn().mockImplementation(() => {
          runResolve?.();
        }),
        dispose: vi.fn().mockResolvedValue(undefined),
        reload: vi.fn().mockResolvedValue(undefined),
      };

      // Use a very short timeout (100ms)
      const TIMEOUT = 100;
      const orc = new Orchestrator(
        {
          routing: { default: 'main', rules: [] },
          session: { inactivityTimeout: 14_400_000 },
          agent: { turnTimeout: TIMEOUT },
        },
        bus,
        new Map([['whatsapp', adapter]]),
        new Map([['main', runner]])
      );
      orc.start();

      bus.publish(makeMsg('Long running task'));

      // Fire the turn-timeout timer deterministically (longer than timeout)
      await vi.advanceTimersByTimeAsync(TIMEOUT + 200);

      expect(runner.abort).toHaveBeenCalled();

      const timeoutMsg = adapter.send.mock.calls.find(
        (c: any[]) => c[1]?.text?.toLowerCase().includes('timed out') ||
                      c[1]?.text?.toLowerCase().includes('timeout')
      );
      expect(timeoutMsg).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('turn timeout does NOT fire if turn completes quickly', async () => {
    vi.useFakeTimers();
    try {
      const runner = {
        prompt: vi.fn().mockImplementation(async (_c: string, onEvent: any) => {
          onEvent({ type: 'text_delta', delta: 'Fast response' });
          onEvent({ type: 'message_end', runId: 'r1', usage: { input: 1, output: 1 } });
        }),
        abort: vi.fn(),
        dispose: vi.fn().mockResolvedValue(undefined),
        reload: vi.fn().mockResolvedValue(undefined),
      };

      const orc = new Orchestrator(
        {
          routing: { default: 'main', rules: [] },
          session: { inactivityTimeout: 14_400_000 },
          agent: { turnTimeout: 5000 },
        },
        bus,
        new Map([['whatsapp', adapter]]),
        new Map([['main', runner]])
      );
      orc.start();

      bus.publish(makeMsg());
      // Advance a little (still far below the 5000ms timeout) to flush the turn's microtasks
      await vi.advanceTimersByTimeAsync(50);

      expect(runner.abort).not.toHaveBeenCalled();
      // Should have gotten a real response
      const responseCall = adapter.send.mock.calls.find(
        (c: any[]) => c[1]?.text === 'Fast response'
      );
      expect(responseCall).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
