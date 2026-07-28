/**
 * Channel content delivery — non-webchat adapters receive the tool's content
 * text fallback for view-producing tools. See
 * reespec/requests/interactive-tool-views/specs/channel-delivery.md.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageBus, createIncomingMessage } from '@src/channels/interface.js';
import type { IncomingMessage } from '@src/channels/interface.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMsg(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return createIncomingMessage({
    channelType: 'whatsapp',
    peerId: 'peer1@s.whatsapp.net',
    content: 'show me the chart',
    raw: {},
    ...overrides,
  });
}

function makeConfig(overrides: any = {}) {
  return {
    routing: { default: 'main', rules: [] },
    session: { inactivityTimeout: 14_400_000 },
    ...overrides,
  } as any;
}

/** A runner that emits a tool_call_end carrying a view, then a text delta + end. */
function makeRunnerWithViewTool(contentText: string) {
  return {
    prompt: vi.fn().mockImplementation(async (_c: string, onEvent: any) => {
      onEvent({ type: 'tool_call_start', toolCallId: 't1', toolName: 'render_chart', args: {} });
      onEvent({
        type: 'tool_call_end',
        toolCallId: 't1',
        toolName: 'render_chart',
        result: { content: contentText, view: { type: 'data-chart' } },
        isError: false,
        view: { type: 'data-chart', labels: ['Jan', 'Feb'], values: [10, 20], kind: 'bar' },
      });
      onEvent({ type: 'text_delta', delta: 'Here is the chart.' });
      onEvent({ type: 'message_end', runId: 'r1', usage: { input: 1, output: 1 } });
    }),
    abort: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
  };
}

/** A runner that emits a tool_call_end with NO view (plain tool). */
function makeRunnerWithPlainTool() {
  return {
    prompt: vi.fn().mockImplementation(async (_c: string, onEvent: any) => {
      onEvent({ type: 'tool_call_end', toolCallId: 't1', toolName: 'web_search', result: { content: 'search results' }, isError: false });
      onEvent({ type: 'text_delta', delta: 'Agent reply.' });
      onEvent({ type: 'message_end', runId: 'r1', usage: { input: 1, output: 1 } });
    }),
    abort: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
  };
}

function makeNonWebchatAdapter() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue('connected'),
    startTyping: vi.fn().mockResolvedValue(undefined),
    stopTyping: vi.fn().mockResolvedValue(undefined),
    // NOTE: no sendEvent — this is a non-webchat adapter
  };
}

function makeWebchatAdapter() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    sendEvent: vi.fn(),
    init: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue('connected'),
    selfAddress: vi.fn().mockReturnValue(null),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Orchestrator non-webchat content delivery', () => {
  let bus: MessageBus;
  let Orchestrator: any;

  beforeEach(async () => {
    vi.resetModules();
    ({ Orchestrator } = await import('@src/orchestrator.js'));
    bus = new MessageBus();
  });

  it('D1: delivers tool content fallback to a non-webchat adapter on tool_call_end with view', async () => {
    const adapter = makeNonWebchatAdapter();
    const runner = makeRunnerWithViewTool('Chart: 2 data points\nLabels: Jan, Feb');
    const orc = new Orchestrator(
      makeConfig(),
      bus,
      new Map([['whatsapp', adapter]]),
      new Map([['main', runner]]),
    );
    orc.start();

    bus.publish(makeMsg());
    await new Promise((r) => setTimeout(r, 30));

    // The content fallback must have been delivered as a text message to the peer.
    const fallbackCall = adapter.send.mock.calls.find(
      ([, c]: [string, any]) => c?.type === 'text' && c?.text?.includes('Chart: 2 data points'),
    );
    expect(fallbackCall).toBeDefined();
    expect(fallbackCall![0]).toBe('peer1@s.whatsapp.net');
  });

  it('D2: webchat adapter (sendEvent) does NOT receive the content text via send()', async () => {
    const adapter = makeWebchatAdapter();
    const runner = makeRunnerWithViewTool('Chart: 2 data points\nLabels: Jan, Feb');
    const orc = new Orchestrator(
      makeConfig(),
      bus,
      new Map([['web', adapter]]),
      new Map([['main', runner]]),
    );
    orc.start();

    bus.publish(makeMsg({ channelType: 'web' }));
    await new Promise((r) => setTimeout(r, 30));

    // sendEvent received the structured event (widget path).
    expect(adapter.sendEvent).toHaveBeenCalled();
    // No send() call carried the tool's content fallback text.
    const fallbackCall = adapter.send.mock.calls.find(
      ([, c]: [string, any]) => c?.type === 'text' && c?.text?.includes('Chart: 2 data points'),
    );
    expect(fallbackCall).toBeUndefined();
  });

  it('D3: tools without a view are NOT delivered via the content-fallback path', async () => {
    const adapter = makeNonWebchatAdapter();
    const runner = makeRunnerWithPlainTool();
    const orc = new Orchestrator(
      makeConfig(),
      bus,
      new Map([['whatsapp', adapter]]),
      new Map([['main', runner]]),
    );
    orc.start();

    bus.publish(makeMsg());
    await new Promise((r) => setTimeout(r, 30));

    // No send() call should carry the tool's internal content ("search results");
    // only the LLM's narrative reply ("Agent reply.") should be delivered.
    const toolContentCall = adapter.send.mock.calls.find(
      ([, c]: [string, any]) => c?.text === 'search results',
    );
    expect(toolContentCall).toBeUndefined();
  });

  it('D4: a rejecting send() is swallowed and does not break the turn', async () => {
    const adapter = makeNonWebchatAdapter();
    adapter.send = vi.fn().mockRejectedValue(new Error('transport down'));
    const runner = makeRunnerWithViewTool('Chart: 2 data points');
    const orc = new Orchestrator(
      makeConfig(),
      bus,
      new Map([['whatsapp', adapter]]),
      new Map([['main', runner]]),
    );
    orc.start();

    // Must not throw / reject.
    bus.publish(makeMsg());
    await expect(new Promise((r) => setTimeout(r, 30))).resolves.toBeUndefined();
    expect(runner.prompt).toHaveBeenCalled();
  });
});
