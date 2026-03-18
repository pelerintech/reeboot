/**
 * In-chat command tests (task 5.1) — TDD red
 * Tests orchestrator command handling end-to-end.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageBus, createIncomingMessage } from './channels/interface.js';
import { Orchestrator } from './orchestrator.js';
import type { IncomingMessage } from './channels/interface.js';

function makeMsg(content: string, overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return createIncomingMessage({
    channelType: 'whatsapp',
    peerId: 'peer1@s.whatsapp.net',
    content,
    raw: {},
    ...overrides,
  });
}

function makeConfig() {
  return {
    routing: { default: 'main', rules: [] },
    session: { inactivityTimeout: 14_400_000 },
  } as any;
}

function makeRunner() {
  return {
    prompt: vi.fn().mockImplementation(async (_c: string, onEvent: any) => {
      onEvent({ type: 'text_delta', delta: 'Agent response' });
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

describe('In-chat commands', () => {
  let bus: MessageBus;
  let adapter: ReturnType<typeof makeAdapter>;
  let runner: ReturnType<typeof makeRunner>;
  let orc: Orchestrator;

  beforeEach(() => {
    bus = new MessageBus();
    adapter = makeAdapter();
    runner = makeRunner();
    orc = new Orchestrator(
      makeConfig(),
      bus,
      new Map([['whatsapp', adapter]]),
      new Map([['main', runner]])
    );
    orc.start();
  });

  it('/new resets session — runner.dispose() called', async () => {
    bus.publish(makeMsg('/new'));
    await new Promise(r => setTimeout(r, 20));

    expect(runner.dispose).toHaveBeenCalled();
    expect(adapter.send).toHaveBeenCalledWith(
      'peer1@s.whatsapp.net',
      { type: 'text', text: 'New session started.' }
    );
    // NOT forwarded to agent
    expect(runner.prompt).not.toHaveBeenCalled();
  });

  it('/context <name> switches routing for that peer', async () => {
    bus.publish(makeMsg('/context work'));
    await new Promise(r => setTimeout(r, 20));

    expect(adapter.send).toHaveBeenCalledWith(
      'peer1@s.whatsapp.net',
      { type: 'text', text: 'Switched to context: work' }
    );
    expect(runner.prompt).not.toHaveBeenCalled();
  });

  it('/contexts lists contexts with current marked', async () => {
    bus.publish(makeMsg('/contexts'));
    await new Promise(r => setTimeout(r, 20));

    const call = adapter.send.mock.calls[0];
    expect(call[1].text).toContain('main');
    expect(runner.prompt).not.toHaveBeenCalled();
  });

  it('/status shows context name', async () => {
    bus.publish(makeMsg('/status'));
    await new Promise(r => setTimeout(r, 20));

    const call = adapter.send.mock.calls[0];
    expect(call[1].text).toContain('main');
    expect(runner.prompt).not.toHaveBeenCalled();
  });

  it('/compact sends confirmation', async () => {
    bus.publish(makeMsg('/compact'));
    await new Promise(r => setTimeout(r, 20));

    expect(adapter.send).toHaveBeenCalledWith(
      'peer1@s.whatsapp.net',
      { type: 'text', text: 'Session compacted.' }
    );
    expect(runner.prompt).not.toHaveBeenCalled();
  });

  it('unknown slash command is forwarded to agent', async () => {
    bus.publish(makeMsg('/search for cats'));
    await new Promise(r => setTimeout(r, 20));

    expect(runner.prompt).toHaveBeenCalledWith('/search for cats', expect.any(Function));
  });

  it('commands work across channels — /new via different channelType', async () => {
    const webAdapter = makeAdapter();
    orc.stop();
    orc = new Orchestrator(
      makeConfig(),
      bus,
      new Map([['whatsapp', adapter], ['web', webAdapter]]),
      new Map([['main', runner]])
    );
    orc.start();

    bus.publish(makeMsg('/new', { channelType: 'web' }));
    await new Promise(r => setTimeout(r, 20));

    expect(runner.dispose).toHaveBeenCalled();
    expect(webAdapter.send).toHaveBeenCalledWith(
      'peer1@s.whatsapp.net',
      { type: 'text', text: 'New session started.' }
    );
  });
});
