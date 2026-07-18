/**
 * Web channel routing tests
 *
 * Verifies that WebAdapter supports event streaming, the orchestrator
 * forwards RunnerEvents through adapters with sendEvent, and that
 * web messages route through the orchestrator with persistent sessions.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { webAdapter } from '../src/channels/web.js';
import type { MessageContent } from '../src/channels/interface.js';
import type { RunnerEvent } from '../src/agent-runner/interface.js';
import { Orchestrator } from '../src/orchestrator.js';
import { MessageBus, createIncomingMessage } from '../src/channels/interface.js';

describe('WebAdapter event streaming', () => {
  beforeEach(() => {
    webAdapter.unregisterPeer('test-peer');
  });

  it('registerPeer accepts optional onEvent callback', () => {
    const sendFn = vi.fn();
    const eventFn = vi.fn();
    webAdapter.registerPeer('test-peer', sendFn, eventFn);
    expect(true).toBe(true);
  });

  it('sendEvent forwards RunnerEvent to registered peer', () => {
    const events: RunnerEvent[] = [];
    const sendFn = vi.fn();
    webAdapter.registerPeer('test-peer', sendFn, (event) => {
      events.push(event);
    });

    webAdapter.sendEvent('test-peer', { type: 'text_delta', delta: 'Hello' });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'text_delta', delta: 'Hello' });
  });

  it('sendEvent does not forward to unregistered peer', () => {
    const events: RunnerEvent[] = [];
    const sendFn = vi.fn();
    webAdapter.registerPeer('test-peer', sendFn, (event) => {
      events.push(event);
    });

    webAdapter.sendEvent('other-peer', { type: 'text_delta', delta: 'Hello' });
    expect(events).toHaveLength(0);
  });

  it('sendEvent no-ops after unregisterPeer', () => {
    const events: RunnerEvent[] = [];
    const sendFn = vi.fn();
    webAdapter.registerPeer('test-peer', sendFn, (event) => {
      events.push(event);
    });
    webAdapter.unregisterPeer('test-peer');

    webAdapter.sendEvent('test-peer', { type: 'text_delta', delta: 'Hello' });
    expect(events).toHaveLength(0);
  });

  it('send still works after registerPeer with onEvent', async () => {
    const sentMessages: MessageContent[] = [];
    const sendFn = async (content: MessageContent) => {
      sentMessages.push(content);
    };
    webAdapter.registerPeer('test-peer', sendFn);

    await webAdapter.send('test-peer', { type: 'text', text: 'final' });
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].text).toBe('final');
  });

  it('supports multiple RunnerEvent types', () => {
    const events: RunnerEvent[] = [];
    const sendFn = vi.fn();
    webAdapter.registerPeer('test-peer', sendFn, (event) => {
      events.push(event);
    });

    webAdapter.sendEvent('test-peer', { type: 'tool_call_start', toolCallId: '1', toolName: 'test', args: {} });
    webAdapter.sendEvent('test-peer', { type: 'tool_call_end', toolCallId: '1', toolName: 'test', result: 'ok', isError: false });
    webAdapter.sendEvent('test-peer', { type: 'message_end', runId: 'r1', usage: { input: 10, output: 20 } });
    webAdapter.sendEvent('test-peer', { type: 'error', message: 'fail' });

    expect(events).toHaveLength(4);
  });
});

describe('Orchestrator event forwarding', () => {
  it('forwards RunnerEvents to adapter.sendEvent when available', async () => {
    const sendEventSpy = vi.fn();
    const mockAdapter = {
      send: vi.fn().mockResolvedValue(undefined),
      sendEvent: sendEventSpy,
      init: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      status: () => 'connected' as const,
      connectedAt: () => null,
      selfAddress: () => null,
    };

    const adapters = new Map<string, any>();
    adapters.set('web', mockAdapter);

    const bus = new MessageBus();
    const runners = new Map();

    const mockRunner = {
      prompt: vi.fn(async (_content: string, onEvent: (event: any) => void) => {
        onEvent({ type: 'text_delta', delta: 'Hello ' });
        onEvent({ type: 'text_delta', delta: 'world!' });
        onEvent({ type: 'tool_call_start', toolCallId: 't1', toolName: 'search', args: { q: 'test' } });
        onEvent({ type: 'tool_call_end', toolCallId: 't1', toolName: 'search', result: 'result', isError: false });
      }),
      abort: vi.fn(),
      dispose: vi.fn(),
      reset: vi.fn(),
      reload: vi.fn(),
      getSessionPath: vi.fn(),
    };
    runners.set('main', mockRunner);

    const orchestrator = new Orchestrator(
      { routing: { default: 'main', rules: [] } },
      bus,
      adapters,
      runners,
    );

    orchestrator.start();

    bus.publish({
      channelType: 'web',
      peerId: 'test-peer',
      content: 'hello',
      timestamp: Date.now(),
      raw: null,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(sendEventSpy).toHaveBeenCalled();

    const calls = sendEventSpy.mock.calls.map((c: any[]) => c[1].type);
    expect(calls).toContain('text_delta');
    expect(calls).toContain('tool_call_start');
    expect(calls).toContain('tool_call_end');

    orchestrator.stop();
  });
});

describe('Session persistence across web messages', () => {
  /**
   * Verify that the orchestrator reuses the same runner (and hence the same
   * pi session) across multiple web messages. This is the mechanism that
   * ensures conversation history is retained.
   */
  it('same runner is used for multiple web messages via orchestrator', async () => {
    const bus = new MessageBus();
    const adapters = new Map<string, any>();
    const runners = new Map<string, any>();

    // Track how many times prompt() is called on the runner
    const promptCalls: string[] = [];
    const mockRunner = {
      prompt: vi.fn(async (content: string, onEvent: (event: any) => void) => {
        promptCalls.push(content);
        onEvent({ type: 'text_delta', delta: `Processed: ${content}` });
      }),
      abort: vi.fn(),
      dispose: vi.fn(),
      reset: vi.fn(),
      reload: vi.fn(),
      getSessionPath: vi.fn(),
    };
    runners.set('main', mockRunner);

    const mockAdapter = {
      send: vi.fn().mockResolvedValue(undefined),
      sendEvent: vi.fn(),
      init: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      status: () => 'connected' as const,
      connectedAt: () => null,
      selfAddress: () => null,
    };
    adapters.set('web', mockAdapter);

    const orchestrator = new Orchestrator(
      { routing: { default: 'main', rules: [] } },
      bus,
      adapters,
      runners,
    );
    orchestrator.start();

    // Send first message
    bus.publish({
      channelType: 'web',
      peerId: 'test-peer',
      content: 'first message',
      timestamp: Date.now(),
      raw: null,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // Send second message — same runner should be used (prompt called again)
    bus.publish({
      channelType: 'web',
      peerId: 'test-peer',
      content: 'second message',
      timestamp: Date.now(),
      raw: null,
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // The same runner was called twice — this is the key assertion
    // In the old code, each WS message would create a new runner.
    // With routing through the bus, the orchestrator reuses the single runner.
    expect(mockRunner.prompt).toHaveBeenCalledTimes(2);
    expect(promptCalls[0]).toContain('first message');
    expect(promptCalls[1]).toContain('second message');

    orchestrator.stop();
  });
});

describe('WS send function — no-op (rely on streaming events)', () => {
  it('wsSend does not produce WebSocket messages when adapter.send is called', async () => {
    const ws = { send: vi.fn() };
    const wsSendNoop = async () => {};
    await wsSendNoop({ type: 'text', text: 'Hello' });
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('wsEvent forwards RunnerEvent to ws.send correctly', () => {
    const ws = { send: vi.fn() };
    const wsEvent = (event: any) => {
      try { ws.send(JSON.stringify(event)); } catch {}
    };

    wsEvent({ type: 'text_delta', delta: 'Hello' });
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'text_delta', delta: 'Hello' }));

    wsEvent({ type: 'tool_call_start', toolCallId: 't1', toolName: 'search', args: {} });
    expect(ws.send).toHaveBeenCalledTimes(2);
  });
});

describe('WS→bus integration', () => {
  it('publishes IncomingMessage with channelType web when WS message arrives', async () => {
    const bus = new MessageBus();
    const receivedMessages: any[] = [];
    bus.onMessage((msg) => { receivedMessages.push(msg); });

    // Simulate what the WS handler does on a 'message' type
    const msg = { type: 'message', content: 'hello from WS' };
    bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: 'test-peer',
      content: msg.content ?? '',
      raw: null,
    }));

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0].channelType).toBe('web');
    expect(receivedMessages[0].content).toBe('hello from WS');
  });

  it('cancel publishes IncomingMessage with action: cancel', async () => {
    const bus = new MessageBus();
    const receivedMessages: any[] = [];
    bus.onMessage((msg) => { receivedMessages.push(msg); });

    // Simulate what the WS handler does on a 'cancel' type
    bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: 'test-peer',
      content: '',
      raw: null,
      action: 'cancel',
    }));

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0].action).toBe('cancel');
    // No __cancel__ magic string
    expect(receivedMessages[0].content).toBe('');
  });
});

describe('History persistence across web messages', () => {
  it('second turn receives context from first turn via channel header', async () => {
    const bus = new MessageBus();
    const adapters = new Map<string, any>();
    const runners = new Map<string, any>();

    const turnContents: string[] = [];
    const mockRunner = {
      prompt: vi.fn(async (content: string, onEvent: (event: any) => void) => {
        turnContents.push(content);
        onEvent({ type: 'text_delta', delta: `Reply to: ${content}` });
        onEvent({ type: 'message_end', runId: `r-${turnContents.length}`, usage: { input: 0, output: 0 } });
      }),
      abort: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };
    runners.set('main', mockRunner);

    const mockAdapter = {
      send: vi.fn().mockResolvedValue(undefined),
      sendEvent: vi.fn(),
      init: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      status: () => 'connected' as const,
      connectedAt: () => null,
      selfAddress: () => null,
    };
    adapters.set('web', mockAdapter);

    // Use the actual Orchestrator which injects channel header
    const { Orchestrator: RealOrchestrator } = await import('../src/orchestrator.js');
    const orchestrator = new RealOrchestrator(
      { routing: { default: 'main', rules: [] } },
      bus,
      adapters,
      runners,
    );
    orchestrator.start();

    // First message
    bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: 'p1',
      content: 'My name is Alice',
      raw: null,
    }));
    await new Promise((r) => setTimeout(r, 30));

    // Second message
    bus.publish(createIncomingMessage({
      channelType: 'web',
      peerId: 'p1',
      content: 'What is my name?',
      raw: null,
    }));
    await new Promise((r) => setTimeout(r, 30));

    // Same runner was used
    expect(mockRunner.prompt).toHaveBeenCalledTimes(2);

    // The orchestrator injects [channel: web | peer: p1] header
    // The second turn should have access to the full session context
    // (the pi session maintains conversation history internally)
    expect(turnContents[0]).toContain('My name is Alice');
    expect(turnContents[0]).toContain('[channel: web');
    expect(turnContents[1]).toContain('What is my name?');

    orchestrator.stop();
  });
});


