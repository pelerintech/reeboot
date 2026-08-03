import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const WORKSPACE = mkdtempSync(join(tmpdir(), 'reeboot-runtime-'));
import type { ExtensionContext, ToolDefinition } from '@src/extensions/extension-api.js';

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

const mockConfig = { agent: { model: { provider: 'openai' } } };

// ─── Task 7: ReeRuntime — creates, tracks, and disposes chats ────────────────

describe('ReeRuntime — creates, tracks, and disposes chats', () => {
  let ReeRuntime: typeof import('@src/runtime/ree-runtime.js').ReeRuntime;

  beforeEach(async () => {
    const mod = await import('@src/runtime/ree-runtime.js');
    ReeRuntime = mod.ReeRuntime;
  });

  it('createChat creates and stores a chat', () => {
    const runtime = new ReeRuntime({
      config: mockConfig,
      maxChats: 10,
      idleTtlMs: 60000,
      maxHistoryPerChat: 50,
    });

    const chat = runtime.createChat('c1', { context: mockContext });
    expect(chat).toBeDefined();
    expect(runtime.getChat('c1')).toBe(chat);
    expect(runtime.chatCount).toBe(1);
  });

  it('disposeChat removes the chat', () => {
    const runtime = new ReeRuntime({
      config: mockConfig,
      maxChats: 10,
      idleTtlMs: 60000,
      maxHistoryPerChat: 50,
    });

    runtime.createChat('c1', { context: mockContext });
    expect(runtime.chatCount).toBe(1);

    runtime.disposeChat('c1');
    expect(runtime.getChat('c1')).toBeUndefined();
    expect(runtime.chatCount).toBe(0);
  });

  it('getChat returns undefined for non-existent chat', () => {
    const runtime = new ReeRuntime({
      config: mockConfig,
      maxChats: 10,
      idleTtlMs: 60000,
      maxHistoryPerChat: 50,
    });

    expect(runtime.getChat('nonexistent')).toBeUndefined();
  });

  it('shutdown disposes all chats', () => {
    const runtime = new ReeRuntime({
      config: mockConfig,
      maxChats: 10,
      idleTtlMs: 60000,
      maxHistoryPerChat: 50,
    });

    runtime.createChat('c1', { context: mockContext });
    runtime.createChat('c2', { context: mockContext });
    expect(runtime.chatCount).toBe(2);

    runtime.shutdown();
    expect(runtime.chatCount).toBe(0);
  });

  it('getOrCreateChat returns existing chat or creates new one', () => {
    const runtime = new ReeRuntime({
      config: mockConfig,
      maxChats: 10,
      idleTtlMs: 60000,
      maxHistoryPerChat: 50,
    });

    const chat1 = runtime.getOrCreateChat('c1', { context: mockContext });
    const chat2 = runtime.getOrCreateChat('c1', { context: mockContext });
    expect(chat1).toBe(chat2); // same instance
    expect(runtime.chatCount).toBe(1);
  });
});

// ─── Task 8: ReeRuntime — chat isolation and shared resources ────────────────

describe('ReeRuntime — chat isolation and shared resources', () => {
  let ReeRuntime: typeof import('@src/runtime/ree-runtime.js').ReeRuntime;

  beforeEach(async () => {
    const mod = await import('@src/runtime/ree-runtime.js');
    ReeRuntime = mod.ReeRuntime;
  });

  it('chats have isolated emitters', () => {
    const runtime = new ReeRuntime({
      config: mockConfig,
      maxChats: 10,
      idleTtlMs: 60000,
      maxHistoryPerChat: 50,
    });

    const chatA = runtime.createChat('chat-a', { context: mockContext });
    const chatB = runtime.createChat('chat-b', { context: mockContext });

    expect(chatA.emitter).not.toBe(chatB.emitter);

    const handlerA = vi.fn();
    const handlerB = vi.fn();

    chatA.adapter.on('turn_end', handlerA);
    chatB.adapter.on('turn_end', handlerB);

    chatA.emitTurnEnd({ turnId: 't1', turnIndex: 0, message: {}, toolResults: [] });

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(0);
  });

  it('chats share the runtime config (reference equality)', () => {
    const runtime = new ReeRuntime({
      config: mockConfig,
      maxChats: 10,
      idleTtlMs: 60000,
      maxHistoryPerChat: 50,
    });

    const chatA = runtime.createChat('chat-a', { context: mockContext });
    const chatB = runtime.createChat('chat-b', { context: mockContext });

    expect(chatA.adapter.context.config).toBe(mockConfig);
    expect(chatB.adapter.context.config).toBe(mockConfig);
  });

  it('50 chats do not duplicate the config', () => {
    const runtime = new ReeRuntime({
      config: mockConfig,
      maxChats: 100,
      idleTtlMs: 60000,
      maxHistoryPerChat: 50,
    });

    for (let i = 0; i < 50; i++) {
      runtime.createChat(`chat-${i}`, { context: mockContext });
    }

    expect(runtime.chatCount).toBe(50);
    // All chats should reference the same config object
    for (let i = 0; i < 50; i++) {
      const chat = runtime.getChat(`chat-${i}`);
      expect(chat?.adapter.context.config).toBe(mockConfig);
    }
  });
});

// ─── Task 9: ReeRuntime — idle eviction and chat limit ──────────────────────

describe('ReeRuntime — idle eviction and chat limit', () => {
  let ReeRuntime: typeof import('@src/runtime/ree-runtime.js').ReeRuntime;

  beforeEach(async () => {
    const mod = await import('@src/runtime/ree-runtime.js');
    ReeRuntime = mod.ReeRuntime;
  });

  it('sweepIdle disposes chats exceeding idleTtlMs', () => {
    vi.useFakeTimers();
    try {
      const runtime = new ReeRuntime({
        config: mockConfig,
        maxChats: 10,
        idleTtlMs: 50,
        maxHistoryPerChat: 50,
      });

      runtime.createChat('idle-chat', { context: mockContext });
      expect(runtime.chatCount).toBe(1);

      // Expire the idle TTL deterministically
      vi.advanceTimersByTime(100);
      runtime.sweepIdle();
      expect(runtime.chatCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sweepIdle keeps recently active chats', () => {
    vi.useFakeTimers();
    try {
      const runtime = new ReeRuntime({
        config: mockConfig,
        maxChats: 10,
        idleTtlMs: 50,
        maxHistoryPerChat: 50,
      });

      const chat = runtime.createChat('active-chat', { context: mockContext });

      // Let the TTL elapse, then touch to re-mark recent BEFORE sweeping
      vi.advanceTimersByTime(100);
      chat.touch();

      runtime.sweepIdle();
      expect(runtime.chatCount).toBe(1); // still there (touched just before sweep)
    } finally {
      vi.useRealTimers();
    }
  });

  it('maxChats enforces the limit by evicting oldest idle chat', () => {
    const runtime = new ReeRuntime({
      config: mockConfig,
      maxChats: 2,
      idleTtlMs: 60000,
      maxHistoryPerChat: 50,
    });

    runtime.createChat('c1', { context: mockContext });
    runtime.createChat('c2', { context: mockContext });
    expect(runtime.chatCount).toBe(2);

    // Attempt to create a 3rd — should evict the oldest idle chat
    runtime.createChat('c3', { context: mockContext });
    expect(runtime.chatCount).toBe(2); // never exceeds maxChats
  });
});
