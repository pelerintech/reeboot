import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from '@src/extensions/extension-api.js';

const WORKSPACE = mkdtempSync(join(tmpdir(), 'reeboot-adapter-'));

// ─── Mock ReeChat (minimal stub for adapter tests; real ReeChat is task 4) ───

interface MockReeChat {
  chatId: string;
  sessionId: string;
  emitter: EventEmitter;
  tools: Map<string, ToolDefinition>;
  commands: Map<string, { description?: string; handler: (args: string, ctx: ExtensionContext) => Promise<void> | void }>;
  sessionName: string | undefined;
  disposed: boolean;
  history: unknown[];
}

function createMockChat(chatId = 'test-chat'): MockReeChat {
  return {
    chatId,
    sessionId: chatId,
    emitter: new EventEmitter(),
    tools: new Map(),
    commands: new Map(),
    sessionName: undefined,
    disposed: false,
    history: [],
  };
}

const mockContext: ExtensionContext = {
  cwd: WORKSPACE,
  workspacePath: WORKSPACE,
  config: { agent: { model: { provider: 'openai' } } },
  ui: {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => {},
  },
  hasUI: false,
};

// ─── Task 1: ReeExtensionAdapter implements ExtensionAPI ─────────────────────

describe('ReeExtensionAdapter — implements ExtensionAPI', () => {
  let Adapter: typeof import('@src/extensions/ree-adapter.js').ReeExtensionAdapter;

  beforeEach(async () => {
    const mod = await import('@src/extensions/ree-adapter.js');
    Adapter = mod.ReeExtensionAdapter;
  });

  function createAdapter(chatId = 'test-chat') {
    const chat = createMockChat(chatId);
    return { adapter: new Adapter(chat as any, mockContext), chat };
  }

  it('exists and is a class', () => {
    expect(Adapter).toBeDefined();
    expect(typeof Adapter).toBe('function');
  });

  it('has all required ExtensionAPI methods', () => {
    const { adapter } = createAdapter();

    expect(typeof (adapter as ExtensionAPI).registerTool).toBe('function');
    expect(typeof (adapter as ExtensionAPI).on).toBe('function');
    expect(typeof (adapter as ExtensionAPI).getAllTools).toBe('function');
    expect(typeof (adapter as ExtensionAPI).getActiveTools).toBe('function');
    expect(typeof (adapter as ExtensionAPI).registerCommand).toBe('function');
    expect(typeof (adapter as ExtensionAPI).setSessionName).toBe('function');
    expect(typeof (adapter as ExtensionAPI).getSessionName).toBe('function');
    expect(typeof (adapter as ExtensionAPI).sendMessage).toBe('function');
    expect((adapter as ExtensionAPI).context).toBeDefined();
  });

  it('registerTool adds to chat tool registry', () => {
    const { adapter, chat } = createAdapter();

    const tool: ToolDefinition = {
      name: 'test_tool',
      label: 'Test Tool',
      description: 'A test tool',
      parameters: {},
      execute: async () => ({ content: 'ok' }),
    };

    (adapter as ExtensionAPI).registerTool(tool);
    expect(chat.tools.has('test_tool')).toBe(true);
    expect(chat.tools.get('test_tool')?.name).toBe('test_tool');
  });

  it('getAllTools returns registered tools as ToolInfo[]', () => {
    const { adapter } = createAdapter();

    const tool: ToolDefinition = {
      name: 'my_tool',
      label: 'My Tool',
      description: 'Does something',
      parameters: { type: 'object' },
      execute: async () => ({ content: 'result' }),
    };

    (adapter as ExtensionAPI).registerTool(tool);
    const tools = (adapter as ExtensionAPI).getAllTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ name: 'my_tool', description: 'Does something' });
  });

  it('getActiveTools returns tool names', () => {
    const { adapter } = createAdapter();

    const tool: ToolDefinition = {
      name: 'active_tool',
      label: 'Active Tool',
      description: 'An active tool',
      parameters: {},
      execute: async () => ({ content: 'ok' }),
    };

    (adapter as ExtensionAPI).registerTool(tool);
    expect((adapter as ExtensionAPI).getActiveTools()).toContain('active_tool');
  });

  it('registerCommand stores command on chat', () => {
    const { adapter, chat } = createAdapter();

    const handler = vi.fn();
    (adapter as ExtensionAPI).registerCommand('/test', { description: 'Test command', handler });
    expect(chat.commands.has('/test')).toBe(true);
    expect(chat.commands.get('/test')?.description).toBe('Test command');
  });

  it('setSessionName and getSessionName operate on chat-local state', () => {
    const { adapter } = createAdapter();

    expect((adapter as ExtensionAPI).getSessionName?.()).toBeUndefined();
    (adapter as ExtensionAPI).setSessionName?.('my-session');
    expect((adapter as ExtensionAPI).getSessionName?.()).toBe('my-session');
  });

  it('sendMessage operates on chat-local state', () => {
    const { adapter } = createAdapter();

    expect(() => {
      (adapter as ExtensionAPI).sendMessage?.({ customType: 'test', content: 'hello' });
    }).not.toThrow();
  });

  it('context returns the provided ExtensionContext', () => {
    const { adapter } = createAdapter();
    expect((adapter as ExtensionAPI).context).toBe(mockContext);
    expect((adapter as ExtensionAPI).context?.workspacePath).toBe(WORKSPACE);
  });

  it('on() subscribes to chat events and returns an unsubscribe function', () => {
    const { adapter } = createAdapter();
    const handler = vi.fn();
    const unsub = (adapter as ExtensionAPI).on('before_agent_start', handler);
    expect(typeof unsub).toBe('function');
  });
});

// ─── Task 2: ReeExtensionAdapter — real unsubscribe ──────────────────────────

describe('ReeExtensionAdapter — real unsubscribe', () => {
  let Adapter: typeof import('@src/extensions/ree-adapter.js').ReeExtensionAdapter;

  beforeEach(async () => {
    const mod = await import('@src/extensions/ree-adapter.js');
    Adapter = mod.ReeExtensionAdapter;
  });

  function createAdapter(chatId = 'test-chat') {
    const chat = createMockChat(chatId);
    return { adapter: new Adapter(chat as any, mockContext), chat };
  }

  it('unsubscribe removes the handler — handler not called after unsub', () => {
    const { adapter, chat } = createAdapter();

    const handler = vi.fn();
    const unsub = (adapter as ExtensionAPI).on('tool_call', handler);

    // Emit before unsubscribe
    chat.emitter.emit('tool_call', { type: 'tool_call', toolCallId: 'c1', toolName: 'test', args: {} });
    expect(handler).toHaveBeenCalledTimes(1);

    // Unsubscribe
    unsub();

    // Emit after unsubscribe — handler should NOT be called
    chat.emitter.emit('tool_call', { type: 'tool_call', toolCallId: 'c2', toolName: 'test', args: {} });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handler receives typed events (ToolCallEvent with args, not input)', () => {
    const { adapter, chat } = createAdapter();

    const handler = vi.fn();
    (adapter as ExtensionAPI).on('tool_call', handler);

    chat.emitter.emit('tool_call', {
      type: 'tool_call',
      toolCallId: 'call_123',
      toolName: 'bash',
      args: { command: 'ls -la' },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const receivedEvent = handler.mock.calls[0][0];
    expect(receivedEvent.type).toBe('tool_call');
    expect(receivedEvent.args).toEqual({ command: 'ls -la' });
    expect('input' in receivedEvent).toBe(false);
  });

  it('multiple unsubscribes are idempotent', () => {
    const { adapter } = createAdapter();

    const handler = vi.fn();
    const unsub = (adapter as ExtensionAPI).on('turn_end', handler);

    unsub();
    expect(() => unsub()).not.toThrow();
    expect(() => unsub()).not.toThrow();
  });
});

// ─── Task 3: ReeExtensionAdapter — selective unsubscribe and disposed-chat guard ───

describe('ReeExtensionAdapter — selective unsubscribe and disposed-chat guard', () => {
  let Adapter: typeof import('@src/extensions/ree-adapter.js').ReeExtensionAdapter;

  beforeEach(async () => {
    const mod = await import('@src/extensions/ree-adapter.js');
    Adapter = mod.ReeExtensionAdapter;
  });

  function createAdapter(chatId = 'test-chat') {
    const chat = createMockChat(chatId);
    return { adapter: new Adapter(chat as any, mockContext), chat };
  }

  it('selective unsubscribe — removing h1 does not affect h2', () => {
    const { adapter, chat } = createAdapter();

    const h1 = vi.fn();
    const h2 = vi.fn();

    const unsub1 = (adapter as ExtensionAPI).on('turn_end', h1);
    const unsub2 = (adapter as ExtensionAPI).on('turn_end', h2);

    unsub1();

    chat.emitter.emit('turn_end', {
      type: 'turn_end', turnId: 't1', sessionId: 's1', turnIndex: 0, message: {}, toolResults: [],
    });

    expect(h1).toHaveBeenCalledTimes(0);
    expect(h2).toHaveBeenCalledTimes(1);

    unsub2();
    chat.emitter.emit('turn_end', {
      type: 'turn_end', turnId: 't2', sessionId: 's1', turnIndex: 1, message: {}, toolResults: [],
    });
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('disposed chat throws on adapter.on()', () => {
    const { adapter, chat } = createAdapter();
    chat.disposed = true;

    expect(() => {
      (adapter as ExtensionAPI).on('tool_call', () => {});
    }).toThrow(/chat is disposed/i);
  });

  it('disposed chat throws on registerTool()', () => {
    const { adapter, chat } = createAdapter();
    chat.disposed = true;

    expect(() => {
      (adapter as ExtensionAPI).registerTool({
        name: 'test', label: 'Test', description: 'Test', parameters: {},
        execute: async () => ({ content: 'ok' }),
      });
    }).toThrow(/chat is disposed/i);
  });

  it('disposed chat throws on registerCommand()', () => {
    const { adapter, chat } = createAdapter();
    chat.disposed = true;

    expect(() => {
      (adapter as ExtensionAPI).registerCommand('/test', { handler: () => {} });
    }).toThrow(/chat is disposed/i);
  });
});
