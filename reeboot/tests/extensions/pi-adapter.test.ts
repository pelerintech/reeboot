import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PiExtensionAdapter } from '@src/extensions/pi-adapter.js';
import type { ExtensionContext, ExtensionEventMap } from '@src/extensions/extension-api.js';

const TMP_WS = mkdtempSync(join(tmpdir(), 'reeboot-piws-'));

describe('PiExtensionAdapter', () => {
  const mockContext: ExtensionContext = {
    cwd: '/Users/test/.reeboot/contexts/main/workspace',
    workspacePath: '/Users/test/.reeboot/contexts/main/workspace',
    config: { agent: { model: { provider: 'anthropic' } } },
    ui: {
      select: async () => undefined,
      confirm: async () => false,
      input: async () => undefined,
      notify: () => {},
    },
    hasUI: false,
  };

  function createMockPiSession() {
    const handlers: Map<string, any[]> = new Map();
    return {
      _handlers: handlers,
      registerTool: vi.fn(),
      getAllTools: vi.fn(() => []),
      getActiveTools: vi.fn(() => []),
      registerCommand: vi.fn(),
      on: vi.fn((event, handler) => {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      }),
      setSessionName: vi.fn(),
      getSessionName: vi.fn(() => undefined),
      sendMessage: vi.fn(),
    };
  }

  function firePiEvent(mockPi: any, event: string, payload: any) {
    const handlers = mockPi._handlers.get(event) ?? [];
    const mockCtx = {
      cwd: mockContext.workspacePath,
      ui: mockContext.ui,
      hasUI: false,
      sessionManager: undefined,
      modelRegistry: undefined,
    };
    return Promise.all(handlers.map(h => h(payload, mockCtx)));
  }

  describe('registerTool', () => {
    it('forwards to pi session', () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);

      adapter.registerTool({
        name: 'test_tool',
        label: 'Test Tool',
        description: 'A test tool',
        parameters: {},
        execute: async () => ({ content: 'ok' }),
      } as any);

      expect(mockPi.registerTool).toHaveBeenCalledTimes(1);
      expect(mockPi.registerTool).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'test_tool' }),
      );
    });

    it('throws descriptive error when pi session is null', () => {
      const adapter = new PiExtensionAdapter(null, mockContext);
      expect(() => adapter.registerTool({} as any)).toThrow(
        'Cannot registerTool: pi session not available',
      );
    });
  });

  describe('on()', () => {
    it('subscribes to pi event', () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);
      const handler = vi.fn();

      adapter.on('before_agent_start', handler);

      expect(mockPi.on).toHaveBeenCalledWith('before_agent_start', expect.any(Function));
    });

    it('returns unsubscribe function', () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);
      const handler = vi.fn();

      const unsub = adapter.on('tool_call', handler);
      expect(typeof unsub).toBe('function');
      // Calling unsubscribe is a no-op (pi doesn't support per-handler unsubscribe)
      expect(() => unsub()).not.toThrow();
    });

    it('throws descriptive error when pi session is null', () => {
      const adapter = new PiExtensionAdapter(null, mockContext);
      expect(() => adapter.on('before_agent_start', () => {})).toThrow(
        "Cannot subscribe to 'before_agent_start': pi session not available",
      );
    });
  });

  describe('optional methods', () => {
    it('setSessionName forwards to pi', () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);

      adapter.setSessionName('my-session');

      expect(mockPi.setSessionName).toHaveBeenCalledWith('my-session');
    });

    it('getSessionName forwards to pi', () => {
      const mockPi = createMockPiSession();
      mockPi.getSessionName.mockReturnValue('my-session');
      const adapter = new PiExtensionAdapter(mockPi, mockContext);

      expect(adapter.getSessionName()).toBe('my-session');
      expect(mockPi.getSessionName).toHaveBeenCalled();
    });

    it('sendMessage forwards to pi', () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);

      adapter.sendMessage({ customType: 'test', content: 'hello' }, { triggerTurn: true });

      expect(mockPi.sendMessage).toHaveBeenCalledWith(
        { customType: 'test', content: 'hello' },
        { triggerTurn: true },
      );
    });

    it('optional methods are no-ops when pi session is null', () => {
      const adapter = new PiExtensionAdapter(null, mockContext);
      expect(() => adapter.setSessionName('test')).not.toThrow();
      expect(adapter.getSessionName()).toBeUndefined();
      expect(() => adapter.sendMessage({ customType: 'test' })).not.toThrow();
    });
  });

  describe('context', () => {
    it('returns the provided ExtensionContext', () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);

      expect(adapter.context).toBe(mockContext);
      expect(adapter.context.workspacePath).toBe(mockContext.workspacePath);
      expect(adapter.context.config).toBe(mockContext.config);
    });
  });

  describe('event transformation', () => {
    it('turn_end: maps turnIndex to turnId, extracts usage', async () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);
      const handler = vi.fn();

      adapter.on('turn_end', handler);

      const piEvent = {
        type: 'turn_end',
        turnIndex: 3,
        message: {
          role: 'assistant',
          content: 'Hello',
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            cost: { total: 0.005 },
          },
        },
        toolResults: [],
      };

      await firePiEvent(mockPi, 'turn_end', piEvent);

      expect(handler).toHaveBeenCalledTimes(1);
      const reebootEvent = handler.mock.calls[0][0];
      expect(reebootEvent.type).toBe('turn_end');
      expect(reebootEvent.turnId).toBe('3');
      expect(reebootEvent.sessionId).toBe('main');
      expect(reebootEvent.turnIndex).toBe(3);
      expect(reebootEvent.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        cost: 0.005,
      });
    });

    it('turn_end: omits usage when message has no usage data', async () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);
      const handler = vi.fn();

      adapter.on('turn_end', handler);

      const piEvent = {
        type: 'turn_end',
        turnIndex: 0,
        message: { role: 'assistant', content: 'Hello' },
        toolResults: [],
      };

      await firePiEvent(mockPi, 'turn_end', piEvent);

      const reebootEvent = handler.mock.calls[0][0];
      expect(reebootEvent.usage).toBeUndefined();
    });

    it('tool_result: preserves input field', async () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);
      const handler = vi.fn();

      adapter.on('tool_result', handler);

      const piEvent = {
        type: 'tool_result',
        toolCallId: 'call_123',
        toolName: 'bash',
        input: { command: 'ls -la' },
        content: [{ type: 'text', text: 'output' }],
        isError: false,
        details: { exitCode: 0 },
      };

      await firePiEvent(mockPi, 'tool_result', piEvent);

      expect(handler).toHaveBeenCalledTimes(1);
      const reebootEvent = handler.mock.calls[0][0];
      expect(reebootEvent.type).toBe('tool_result');
      expect(reebootEvent.toolCallId).toBe('call_123');
      expect(reebootEvent.toolName).toBe('bash');
      expect(reebootEvent.input).toEqual({ command: 'ls -la' });
      expect(reebootEvent.content).toEqual([{ type: 'text', text: 'output' }]);
      expect(reebootEvent.isError).toBe(false);
      expect(reebootEvent.details).toEqual({ exitCode: 0 });
    });

    it('tool_result: defaults input to empty object when absent', async () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);
      const handler = vi.fn();

      adapter.on('tool_result', handler);

      const piEvent = {
        type: 'tool_result',
        toolCallId: 'call_456',
        toolName: 'custom_tool',
        content: [],
        isError: false,
      };

      await firePiEvent(mockPi, 'tool_result', piEvent);

      const reebootEvent = handler.mock.calls[0][0];
      expect(reebootEvent.input).toEqual({});
    });

    it('tool_call: maps pi input → reeboot args', async () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);
      const handler = vi.fn();

      adapter.on('tool_call', handler);

      const piEvent = {
        type: 'tool_call',
        toolCallId: 'call_789',
        toolName: 'bash',
        input: { command: 'rm -rf /' },
      };

      await firePiEvent(mockPi, 'tool_call', piEvent);

      const reebootEvent = handler.mock.calls[0][0];
      expect(reebootEvent.type).toBe('tool_call');
      expect(reebootEvent.toolCallId).toBe('call_789');
      expect(reebootEvent.toolName).toBe('bash');
      expect(reebootEvent.args).toEqual({ command: 'rm -rf /' });
      expect('input' in reebootEvent).toBe(false);
    });

    it('tool_call: defaults args to empty object when pi omits input', async () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);
      const handler = vi.fn();

      adapter.on('tool_call', handler);

      const piEvent = {
        type: 'tool_call',
        toolCallId: 'call_000',
        toolName: 'custom',
      };

      await firePiEvent(mockPi, 'tool_call', piEvent);

      const reebootEvent = handler.mock.calls[0][0];
      expect(reebootEvent.args).toEqual({});
    });

    it('session_shutdown: adds sessionId', async () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);
      const handler = vi.fn();

      adapter.on('session_shutdown', handler);

      const piEvent = {
        type: 'session_shutdown',
        reason: 'quit',
        targetSessionFile: '/path/to/session.jsonl',
      };

      await firePiEvent(mockPi, 'session_shutdown', piEvent);

      expect(handler).toHaveBeenCalledTimes(1);
      const reebootEvent = handler.mock.calls[0][0];
      expect(reebootEvent.type).toBe('session_shutdown');
      expect(reebootEvent.sessionId).toBe('main');
      expect(reebootEvent.reason).toBe('quit');
      expect(reebootEvent.targetSessionFile).toBe('/path/to/session.jsonl');
    });

    it('after_provider_response: adds contextId and provider', async () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);
      const handler = vi.fn();

      adapter.on('after_provider_response', handler);

      const piEvent = {
        type: 'after_provider_response',
        status: 200,
        headers: {
          'x-ratelimit-remaining-tokens': '95000',
          'x-ratelimit-remaining-requests': '100',
        },
      };

      await firePiEvent(mockPi, 'after_provider_response', piEvent);

      expect(handler).toHaveBeenCalledTimes(1);
      const reebootEvent = handler.mock.calls[0][0];
      expect(reebootEvent.type).toBe('after_provider_response');
      expect(reebootEvent.contextId).toBe('main');
      expect(reebootEvent.provider).toBe('anthropic');
      expect(reebootEvent.status).toBe(200);
      expect(reebootEvent.headers).toEqual({
        'x-ratelimit-remaining-tokens': '95000',
        'x-ratelimit-remaining-requests': '100',
      });
    });

    it('before_agent_start: passes through unchanged', async () => {
      const mockPi = createMockPiSession();
      const adapter = new PiExtensionAdapter(mockPi, mockContext);
      const handler = vi.fn();

      adapter.on('before_agent_start', handler);

      const piEvent = {
        type: 'before_agent_start',
        prompt: 'Hello',
        systemPrompt: 'You are helpful.',
        systemPromptOptions: {},
      };

      await firePiEvent(mockPi, 'before_agent_start', piEvent);

      expect(handler).toHaveBeenCalledTimes(1);
      const reebootEvent = handler.mock.calls[0][0];
      expect(reebootEvent.type).toBe('before_agent_start');
      expect(reebootEvent.prompt).toBe('Hello');
      expect(reebootEvent.systemPrompt).toBe('You are helpful.');
    });
  });

  describe('context ID derivation', () => {
    it('extracts context ID from workspace path', () => {
      const mockPi = createMockPiSession();
      const ctx: ExtensionContext = {
        ...mockContext,
        cwd: '/Users/test/.reeboot/contexts/support/workspace',
        workspacePath: '/Users/test/.reeboot/contexts/support/workspace',
      };
      const adapter = new PiExtensionAdapter(mockPi, ctx);

      // Verify via session_shutdown event transformation
      const handler = vi.fn();
      adapter.on('session_shutdown', handler);

      const piEvent = { type: 'session_shutdown', reason: 'quit' };
      const mockCtx = { cwd: ctx.workspacePath, ui: ctx.ui, hasUI: false };
      const handlers = mockPi._handlers.get('session_shutdown') ?? [];
      handlers[0](piEvent, mockCtx);

      const reebootEvent = handler.mock.calls[0][0];
      expect(reebootEvent.sessionId).toBe('support');
    });

    it('defaults to main when path does not contain contexts/', () => {
      const mockPi = createMockPiSession();
      const ctx: ExtensionContext = {
        ...mockContext,
        cwd: TMP_WS,
        workspacePath: TMP_WS,
      };
      const adapter = new PiExtensionAdapter(mockPi, ctx);

      const handler = vi.fn();
      adapter.on('session_shutdown', handler);

      const piEvent = { type: 'session_shutdown', reason: 'quit' };
      const mockCtx = { cwd: ctx.workspacePath, ui: ctx.ui, hasUI: false };
      const handlers = mockPi._handlers.get('session_shutdown') ?? [];
      handlers[0](piEvent, mockCtx);

      const reebootEvent = handler.mock.calls[0][0];
      expect(reebootEvent.sessionId).toBe('main');
    });
  });
});
