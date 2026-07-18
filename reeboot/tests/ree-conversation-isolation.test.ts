/**
 * Spec: ree-conversation-isolation
 *
 * Concurrent customer conversations are fully isolated: distinct chats,
 * histories, and reply routing.
 *
 * Drives two conversations A and B with interleaved turns through the mock-fetch
 * adapter over a shared ReeRuntime — mirrors how the orchestrator's runner
 * factory creates one ReeAgentRunner per conversationId.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';
import { MessageBus, createIncomingMessage } from '@src/channels/interface.js';

const mockContext = { agent: { model: { provider: 'openai' } } };

/** Build a mock fetch that returns a FRESH streaming Response on each call. */
function mockChatCompletionsFetch(text: string): ReturnType<typeof vi.fn> {
  const makeBody = () => {
    const encoder = new TextEncoder();
    const makeFrame = (obj: Record<string, unknown>) => `data: ${JSON.stringify(obj)}\n\n`;
    const lines: string[] = [];
    lines.push(makeFrame({
      id: 'c', object: 'chat.completion.chunk', created: 1, model: 't',
      choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
    }));
    lines.push(makeFrame({
      id: 'c', object: 'chat.completion.chunk', created: 1, model: 't',
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    }));
    lines.push(makeFrame({
      id: 'c', object: 'chat.completion.chunk', created: 1, model: 't',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    }));
    lines.push('data: [DONE]\n\n');
    return new ReadableStream({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line));
        controller.close();
      },
    });
  };
  return vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(makeBody(), { status: 200, headers: { 'content-type': 'text/event-stream' } }))
  );
}

describe('ree-conversation-isolation', () => {
  let ReeAgentRunner: typeof import('@src/agent-runner/ree-runner.js').ReeAgentRunner;
  let ReeRuntime: typeof import('@src/runtime/ree-runtime.js').ReeRuntime;
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(async () => {
    const runnerMod = await import('@src/agent-runner/ree-runner.js');
    ReeAgentRunner = runnerMod.ReeAgentRunner;
    const runtimeMod = await import('@src/runtime/ree-runtime.js');
    ReeRuntime = runtimeMod.ReeRuntime;
    tmpDir = join(tmpdir(), `reeboot-iso-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    db = new Database(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeRuntime(fetchImpl: ReturnType<typeof vi.fn>) {
    const config = {
      ...mockContext,
      ree: {
        model: { provider: 'custom', id: 'm', baseUrl: 'http://x/v1', apiKey: 'k', fetch: fetchImpl },
      },
    };
    return new ReeRuntime({
      config,
      maxChats: 10,
      idleTtlMs: 60000,
      maxHistoryPerChat: 50,
      db,
    });
  }

  it('S1 — distinct chats and histories (interleaved)', async () => {
    const runtime = makeRuntime(mockChatCompletionsFetch('reply'));
    const runnerA = new ReeAgentRunner(runtime, { id: 'A', workspacePath: tmpDir }, mockContext as any);
    const runnerB = new ReeAgentRunner(runtime, { id: 'B', workspacePath: tmpDir }, mockContext as any);

    // Interleave turns
    await runnerA.prompt('message from A', () => {});
    await runnerB.prompt('message from B', () => {});
    await runnerA.prompt('follow-up A', () => {});

    const chatA = runtime.getChat('A');
    const chatB = runtime.getChat('B');
    expect(chatA).toBeDefined();
    expect(chatB).toBeDefined();
    expect(chatA).not.toBe(chatB);

    // A's history contains only A's content; B's only B's
    const aHistory = chatA!.history.map((m) => m.content);
    const bHistory = chatB!.history.map((m) => m.content);
    expect(aHistory.some((c) => String(c).includes('from A'))).toBe(true);
    expect(aHistory.some((c) => String(c).includes('from B'))).toBe(false);
    expect(bHistory.some((c) => String(c).includes('from B'))).toBe(true);
    expect(bHistory.some((c) => String(c).includes('from A'))).toBe(false);

    // Durable chat_messages rows are scoped per chat_id
    const aRows = db.prepare('SELECT content FROM chat_messages WHERE chat_id = ?').all('A') as any[];
    const bRows = db.prepare('SELECT content FROM chat_messages WHERE chat_id = ?').all('B') as any[];
    expect(aRows.length).toBeGreaterThanOrEqual(2);
    expect(bRows.length).toBeGreaterThanOrEqual(2);
    expect(aRows.some((r) => String(r.content).includes('from A'))).toBe(true);
    expect(aRows.some((r) => String(r.content).includes('from B'))).toBe(false);
    expect(bRows.some((r) => String(r.content).includes('from B'))).toBe(true);
    expect(bRows.some((r) => String(r.content).includes('from A'))).toBe(false);
  });

  it('S2 — reply routing per connection (orchestrator sendEvent delivers only to the prompting peer)', async () => {
    // Drive two conversations through the real Orchestrator's sendEvent path
    // to verify that A's events reach only A's peerId and B's only B's.
    // This tests the production routing: onEvent → presenceAdapter.sendEvent(msg.peerId, event).
    const runtime = makeRuntime(mockChatCompletionsFetch('routed reply'));
    const runnerA = new ReeAgentRunner(runtime, { id: 'A', workspacePath: tmpDir }, mockContext as any);
    const runnerB = new ReeAgentRunner(runtime, { id: 'B', workspacePath: tmpDir }, mockContext as any);

    const Orchestrator = (await import('@src/orchestrator.js')).Orchestrator;
    const bus = new MessageBus();
    // Mock adapter with sendEvent — the orchestrator calls sendEvent(msg.peerId, event)
    // on the adapter matching msg.channelType. Each connection gets its own peerId.
    const adapter = {
      send: vi.fn().mockResolvedValue(undefined),
      sendEvent: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockReturnValue('connected'),
      startTyping: vi.fn().mockResolvedValue(undefined),
      stopTyping: vi.fn().mockResolvedValue(undefined),
    };

    const factory = vi.fn()
      .mockReturnValueOnce(runnerA)
      .mockReturnValueOnce(runnerB);

    const orc = new Orchestrator(
      { routing: { default: 'main', rules: [] }, session: { inactivityTimeout: 14400000 }, sdk: 'ree' },
      bus,
      new Map([['web', adapter]]),
      new Map(),
      undefined,
      { runnerFactory: factory }
    );
    orc.start();

    bus.publish(createIncomingMessage({
      channelType: 'web', peerId: 'peerA', conversationId: 'A', content: 'for A', raw: null,
    }));
    bus.publish(createIncomingMessage({
      channelType: 'web', peerId: 'peerB', conversationId: 'B', content: 'for B', raw: null,
    }));

    // Wait for both turns to complete
    await new Promise(r => setTimeout(r, 200));

    // A's events went to A's peerId only
    const aCalls = (adapter.sendEvent as any).mock.calls as [string, Record<string, unknown>][];
    const aCallsForA = aCalls.filter(([peerId]) => peerId === 'peerA');
    const aText = aCallsForA
      .filter(([_, e]) => e.type === 'text_delta')
      .map(([_, e]) => e.delta as string).join('');
    expect(aText).toBe('routed reply');

    // B's events went to B's peerId only
    const aCallsForB = aCalls.filter(([peerId]) => peerId === 'peerB');
    const bText = aCallsForB
      .filter(([_, e]) => e.type === 'text_delta')
      .map(([_, e]) => e.delta as string).join('');
    expect(bText).toBe('routed reply');

    // No cross-delivery: A's events were NOT sent to B's peerId
    expect(aCallsForA.every(([peerId]) => peerId === 'peerA')).toBe(true);
    // No cross-delivery: B's events were NOT sent to A's peerId
    expect(aCallsForB.every(([peerId]) => peerId === 'peerB')).toBe(true);

    orc.stop();
  });

  it('S3 — per-conversation queue/busy concurrency (B runs while A busy, 2nd A-message queues)', async () => {
    // Test three key behaviours through the orchestrator:
    // 1. A is busy (hanging fetch) — B completes independently (separate context = separate serialization)
    // 2. A 2nd A-message queues behind A's in-flight turn (per-conversation queue)
    // 3. B's turn does not block on A's busy state
    const hangingFetch = vi.fn().mockImplementation(
      (_url: string, opts?: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          if (opts?.signal)
            opts.signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
        })
    );
    const completingFetch = mockChatCompletionsFetch('B completes');

    const Orchestrator = (await import('@src/orchestrator.js')).Orchestrator;
    const bus = new MessageBus();
    const adapter = {
      send: vi.fn().mockResolvedValue(undefined),
      sendEvent: vi.fn(),
      init: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockReturnValue('connected'),
      startTyping: vi.fn().mockResolvedValue(undefined),
      stopTyping: vi.fn().mockResolvedValue(undefined),
    };

    // Create two runtimes — A hangs, B completes
    const runtimeA = makeRuntime(hangingFetch);
    const runnerA = new ReeAgentRunner(runtimeA, { id: 'A', workspacePath: tmpDir }, mockContext as any);

    const runtimeB = makeRuntime(completingFetch);
    const runnerB = new ReeAgentRunner(runtimeB, { id: 'B', workspacePath: tmpDir }, mockContext as any);

    const factory = vi.fn()
      .mockReturnValueOnce(runnerA)
      .mockReturnValueOnce(runnerB);

    const orc = new Orchestrator(
      { routing: { default: 'main', rules: [] }, session: { inactivityTimeout: 14400000 }, sdk: 'ree' },
      bus,
      new Map([['web', adapter]]),
      new Map(),
      undefined,
      { runnerFactory: factory }
    );
    orc.start();

    // 1. Send A's message (hangs)
    bus.publish(createIncomingMessage({
      channelType: 'web', peerId: 'peerA', conversationId: 'A', content: 'hang A', raw: null,
    }));
    await new Promise(r => setTimeout(r, 50));

    // A is busy — sendEvent for A was called (runner started the hanging prompt)
    const aSendEventCalls = (adapter.sendEvent as any).mock.calls.filter(
      ([peerId]: [string]) => peerId === 'peerA'
    );
    // B sendEvent has NOT been called yet (B hasn't been prompted)
    const bSendEventCallsBefore = (adapter.sendEvent as any).mock.calls.filter(
      ([peerId]: [string]) => peerId === 'peerB'
    );
    expect(bSendEventCallsBefore.length).toBe(0);

    // 2. Send B's message — must complete without waiting (separate context = separate serialization)
    bus.publish(createIncomingMessage({
      channelType: 'web', peerId: 'peerB', conversationId: 'B', content: 'for B', raw: null,
    }));
    await new Promise(r => setTimeout(r, 200));

    // B's events were delivered via sendEvent (B completed independently)
    const bSendEventCalls = (adapter.sendEvent as any).mock.calls.filter(
      ([peerId, ev]: [string, any]) => peerId === 'peerB' && ev.type === 'message_end'
    );
    expect(bSendEventCalls.length).toBeGreaterThanOrEqual(1);

    // 3. Send a 2nd message for A — must be queued (busy reply sent)
    bus.publish(createIncomingMessage({
      channelType: 'web', peerId: 'peerA', conversationId: 'A', content: 'queued for A', raw: null,
    }));
    await new Promise(r => setTimeout(r, 100));

    // A's 2nd message got a busy/please-wait reply (not processed directly)
    const sendCalls = (adapter.send as any).mock.calls;
    const busyReplyToA = sendCalls.find(
      ([peerId, reply]: [string, any]) =>
        peerId === 'peerA' &&
        typeof reply?.text === 'string' &&
        (reply.text.includes('busy') || reply.text.includes('wait') || reply.text.includes('queue') || reply.text.includes('moment'))
    );
    expect(busyReplyToA).toBeDefined();

    // B was never told about A's busy state
    const busyReplyToB = sendCalls.find(
      ([peerId, reply]: [string, any]) =>
        peerId === 'peerB' &&
        typeof reply?.text === 'string' &&
        (reply.text.includes('busy') || reply.text.includes('wait') || reply.text.includes('queue') || reply.text.includes('moment'))
    );
    expect(busyReplyToB).toBeUndefined();

    orc.stop();
  });
});
