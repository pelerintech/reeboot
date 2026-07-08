import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtensionContext, ToolDefinition, ExtensionEventMap } from '@src/extensions/extension-api.js';

const mockContext: ExtensionContext = {
  cwd: '/tmp/test-workspace',
  workspacePath: '/tmp/test-workspace',
  config: { agent: { model: { provider: 'openai' } } },
  ui: {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => {},
  },
  hasUI: false,
};

// ─── Task 4: ReeChat — isolated state and event emission ─────────────────────

describe('ReeChat — isolated state and event emission', () => {
  let ReeChat: typeof import('@src/runtime/ree-chat.js').ReeChat;

  beforeEach(async () => {
    const mod = await import('@src/runtime/ree-chat.js');
    ReeChat = mod.ReeChat;
  });

  it('two chats have independent tool registries', () => {
    const chatA = new ReeChat('chat-a', { maxHistory: 50, context: mockContext, config: mockContext.config });
    const chatB = new ReeChat('chat-b', { maxHistory: 50, context: mockContext, config: mockContext.config });

    // Register a tool on chatA via its adapter
    const adapterA = chatA.adapter;
    adapterA.registerTool({
      name: 'tool-a',
      label: 'Tool A',
      description: 'Tool for chat A',
      parameters: {},
      execute: async () => ({ content: 'a' }),
    });

    // chatB should have no tools
    const adapterB = chatB.adapter;
    expect(adapterB.getAllTools()).toHaveLength(0);
    expect(adapterA.getAllTools()).toHaveLength(1);
  });

  it('each chat has its own EventEmitter', () => {
    const chatA = new ReeChat('chat-a', { maxHistory: 50, context: mockContext, config: mockContext.config });
    const chatB = new ReeChat('chat-b', { maxHistory: 50, context: mockContext, config: mockContext.config });

    const handlerA = vi.fn();
    const handlerB = vi.fn();

    chatA.adapter.on('turn_end', handlerA);
    chatB.adapter.on('turn_end', handlerB);

    // Emit on chatA — only handlerA should fire
    chatA.emitTurnEnd({ turnId: 't1', message: {}, toolResults: [] });

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(0);
  });

  it('dispose() emits session_shutdown and removes listeners', () => {
    const chat = new ReeChat('chat-1', { maxHistory: 50, context: mockContext, config: mockContext.config });
    const handler = vi.fn();

    chat.adapter.on('session_shutdown', handler);
    chat.dispose();

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event.type).toBe('session_shutdown');
    expect(event.sessionId).toBe('chat-1');

    // After dispose, further subscriptions should throw
    expect(() => chat.adapter.on('turn_end', () => {})).toThrow(/disposed/i);
  });

  it('reset() emits session_shutdown with reason "new" and clears history', () => {
    const chat = new ReeChat('chat-1', { maxHistory: 50, context: mockContext, config: mockContext.config });

    // Add some history
    chat.appendMessage({ role: 'user', content: 'hello' });
    chat.appendMessage({ role: 'assistant', content: 'hi back' });
    expect(chat.history.length).toBe(2);

    const handler = vi.fn();
    chat.adapter.on('session_shutdown', handler);

    chat.reset();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].reason).toBe('new');
    expect(chat.history.length).toBe(0);
  });

  it('chat has chatId and sessionId properties', () => {
    const chat = new ReeChat('my-chat-id', { maxHistory: 50, context: mockContext, config: mockContext.config });
    expect(chat.chatId).toBe('my-chat-id');
    expect(chat.sessionId).toBe('my-chat-id');
  });
});

// ─── Task 5: ReeChat — emits reeboot-shaped events ───────────────────────────

describe('ReeChat — emits reeboot-shaped events', () => {
  let ReeChat: typeof import('@src/runtime/ree-chat.js').ReeChat;

  beforeEach(async () => {
    const mod = await import('@src/runtime/ree-chat.js');
    ReeChat = mod.ReeChat;
  });

  function createChat() {
    return new ReeChat('test-chat', { maxHistory: 50, context: mockContext, config: mockContext.config });
  }

  it('before_agent_start has prompt, systemPrompt, systemPromptOptions', () => {
    const chat = createChat();
    const handler = vi.fn();
    chat.adapter.on('before_agent_start', handler);

    chat.emitBeforeAgentStart({
      prompt: 'Hello',
      systemPrompt: 'You are helpful.',
      systemPromptOptions: { model: 'gpt-4o' },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event.type).toBe('before_agent_start');
    expect(event.prompt).toBe('Hello');
    expect(event.systemPrompt).toBe('You are helpful.');
  });

  it('turn_end has turnId, sessionId, turnIndex, usage', () => {
    const chat = createChat();
    const handler = vi.fn();
    chat.adapter.on('turn_end', handler);

    chat.emitTurnEnd({
      turnId: 'turn-42',
      turnIndex: 3,
      message: { role: 'assistant', content: 'Response' },
      toolResults: [],
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event.type).toBe('turn_end');
    expect(event.turnId).toBe('turn-42');
    expect(event.sessionId).toBe('test-chat');
    expect(event.turnIndex).toBe(3);
    expect(event.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
  });

  it('session_shutdown has sessionId and reason', () => {
    const chat = createChat();
    const handler = vi.fn();
    chat.adapter.on('session_shutdown', handler);

    chat.emitSessionShutdown('quit');

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event.type).toBe('session_shutdown');
    expect(event.sessionId).toBe('test-chat');
    expect(event.reason).toBe('quit');
  });

  it('tool_call has toolCallId, toolName, args', () => {
    const chat = createChat();
    const handler = vi.fn();
    chat.adapter.on('tool_call', handler);

    chat.emitToolCall({
      toolCallId: 'call_1',
      toolName: 'bash',
      args: { command: 'ls' },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event.type).toBe('tool_call');
    expect(event.toolCallId).toBe('call_1');
    expect(event.toolName).toBe('bash');
    expect(event.args).toEqual({ command: 'ls' });
  });

  it('tool_result has toolCallId, toolName, input (NOT args), content, isError', () => {
    const chat = createChat();
    const handler = vi.fn();
    chat.adapter.on('tool_result', handler);

    chat.emitToolResult({
      toolCallId: 'call_1',
      toolName: 'bash',
      input: { command: 'ls' },
      content: [{ type: 'text', text: 'output' }],
      isError: false,
      details: { exitCode: 0 },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event.type).toBe('tool_result');
    expect(event.toolCallId).toBe('call_1');
    expect(event.input).toEqual({ command: 'ls' });
    expect('args' in event).toBe(false); // field name gotcha: input, NOT args
    expect(event.content).toEqual([{ type: 'text', text: 'output' }]);
    expect(event.isError).toBe(false);
  });

  it('after_provider_response has contextId, provider, status, headers', () => {
    const chat = createChat();
    const handler = vi.fn();
    chat.adapter.on('after_provider_response', handler);

    chat.emitAfterProviderResponse({
      contextId: 'main',
      provider: 'openai',
      status: 200,
      headers: { 'x-ratelimit-remaining': '95000' },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event.type).toBe('after_provider_response');
    expect(event.contextId).toBe('main');
    expect(event.provider).toBe('openai');
    expect(event.status).toBe(200);
    expect(event.headers).toEqual({ 'x-ratelimit-remaining': '95000' });
  });

  it('agent_end has messages', () => {
    const chat = createChat();
    const handler = vi.fn();
    chat.adapter.on('agent_end', handler);

    chat.emitAgentEnd({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ],
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0];
    expect(event.type).toBe('agent_end');
    expect(event.messages).toHaveLength(2);
  });
});

// ─── Task 6: ReeChat — bounded history and per-chat AbortController ──────────

describe('ReeChat — bounded history and per-chat AbortController', () => {
  let ReeChat: typeof import('@src/runtime/ree-chat.js').ReeChat;

  beforeEach(async () => {
    const mod = await import('@src/runtime/ree-chat.js');
    ReeChat = mod.ReeChat;
  });

  it('maxHistory caps history with FIFO eviction', () => {
    const chat = new ReeChat('chat-1', { maxHistory: 5, context: mockContext, config: mockContext.config });

    // Append 10 messages
    for (let i = 0; i < 10; i++) {
      chat.appendMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg-${i}` });
    }

    expect(chat.history.length).toBe(5);
    // Should contain the 5 most recent (FIFO — oldest evicted first)
    expect(chat.history[0].content).toBe('msg-5');
    expect(chat.history[4].content).toBe('msg-9');
  });

  it('each chat has its own AbortController', () => {
    const chatA = new ReeChat('chat-a', { maxHistory: 50, context: mockContext, config: mockContext.config });
    const chatB = new ReeChat('chat-b', { maxHistory: 50, context: mockContext, config: mockContext.config });

    expect(chatA.abortController).not.toBe(chatB.abortController);
    expect(chatA.abortController.signal.aborted).toBe(false);
    expect(chatB.abortController.signal.aborted).toBe(false);

    chatA.abortController.abort();
    expect(chatA.abortController.signal.aborted).toBe(true);
    expect(chatB.abortController.signal.aborted).toBe(false);
  });
});
