/**
 * Ree Extension Adapter
 *
 * Implements reeboot's ExtensionAPI for the ree SDK (TanStack AI-backed).
 * Unlike PiExtensionAdapter which wraps a pi session, this adapter wraps a
 * ReeChat — a lightweight per-chat state container.
 *
 * Key differences from PiExtensionAdapter:
 * - `on()` returns a **real unsubscribe** that removes the listener (not a no-op)
 * - Events are emitted in reeboot's own shapes (no transformation needed)
 * - All state is chat-local (no pi session delegation)
 */

import { EventEmitter } from 'events';
import { toolRegistry } from './tool-registry.js';
import {
  ExtensionAPI,
  ExtensionEventMap,
  ExtensionContext,
  ExtensionHandler,
  ToolDefinition,
  ToolInfo,
  AuthLevel,
  AUTH_LEVEL_RANK,
} from './extension-api.js';

// ─── Minimal ReeChat interface (full class is in runtime/ree-chat.ts) ─────────

interface ReeChatLike {
  chatId: string;
  sessionId: string;
  emitter: EventEmitter;
  tools: Map<string, ToolDefinition>;
  authLevel?: AuthLevel;
  commands: Map<string, { description?: string; handler: (args: string, ctx: ExtensionContext) => Promise<void> | void }>;
  sessionName: string | undefined;
  disposed: boolean;
  history: unknown[];
}

/**
 * Internal registry for tracking registered handlers so unsubscribe can
 * remove the exact wrapped handler (not all handlers for an event).
 */
interface HandlerEntry {
  event: string;
  wrapped: ExtensionHandler<any, any>;
  original: ExtensionHandler<any, any>;
}

export class ReeExtensionAdapter implements ExtensionAPI {
  /** The chat this adapter is bound to */
  private readonly chat: ReeChatLike;

  /** SDK-agnostic context provided by the runtime */
  readonly context: ExtensionContext;

  /** Internal handler registry for real unsubscribe support */
  private readonly _handlers: HandlerEntry[] = [];

  constructor(chat: ReeChatLike, context: ExtensionContext) {
    this.chat = chat;
    this.context = context;
  }

  /**
   * Register a tool with the chat's tool registry.
   * The tool is stored by name so it can be looked up during agent execution.
   */
  registerTool(tool: ToolDefinition): void {
    if (this.chat.disposed) {
      throw new Error('Cannot registerTool: chat is disposed');
    }
    // Retain the executable in the shared seam so the MCP server can invoke it headless.
    toolRegistry.register(tool);
    this.chat.tools.set(tool.name, tool);
  }

  /** Get all configured tools with metadata */
  getAllTools(): ToolInfo[] {
    const tools: ToolInfo[] = [];
    for (const tool of this.chat.tools.values()) {
      tools.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      });
    }
    return tools;
  }

  /** Get the list of currently active tool names */
  getActiveTools(): string[] {
    return Array.from(this.chat.tools.keys());
  }

  /** Set the chat's auth level (raises/lowers which gated tools are visible). */
  setAuthState(level: AuthLevel): void {
    if (this.chat.disposed) return;
    this.chat.authLevel = level;
  }

  /** Get the chat's current auth level. */
  getAuthState(): AuthLevel {
    return this.chat.authLevel ?? 'anonymous';
  }

  /** Register a custom slash command */
  registerCommand(name: string, options: {
    description?: string;
    handler: (args: string, ctx: ExtensionContext) => Promise<void> | void;
  }): void {
    if (this.chat.disposed) {
      throw new Error('Cannot registerCommand: chat is disposed');
    }
    this.chat.commands.set(name, options);
  }

  /**
   * Subscribe to a chat event.
   *
   * Returns a real unsubscribe function that removes this specific handler
   * from the chat's event emitter. Unlike pi's adapter, this is NOT a no-op.
   */
  on<K extends keyof ExtensionEventMap>(
    event: K,
    handler: ExtensionHandler<ExtensionEventMap[K]>,
  ): () => void {
    if (this.chat.disposed) {
      throw new Error(`Cannot subscribe to '${String(event)}': chat is disposed`);
    }

    // Wrap the handler to pass the reeboot ExtensionContext
    const wrapped: ExtensionHandler<any, any> = (payload: any) => {
      return handler(payload, this.context);
    };

    // Store the entry for unsubscribe
    const entry: HandlerEntry = {
      event: event as string,
      wrapped,
      original: handler,
    };
    this._handlers.push(entry);

    // Register on the chat's emitter
    this.chat.emitter.on(event as string, wrapped);

    // Return a real unsubscribe function
    return () => {
      this.chat.emitter.off(event as string, wrapped);
      const idx = this._handlers.indexOf(entry);
      if (idx >= 0) {
        this._handlers.splice(idx, 1);
      }
    };
  }

  /** Set the session display name */
  setSessionName(name: string): void {
    if (this.chat.disposed) return;
    this.chat.sessionName = name;
  }

  /** Get the current session name */
  getSessionName(): string | undefined {
    return this.chat.sessionName;
  }

  /** Get the current chat ID */
  getCurrentChatId(): string | undefined {
    return this.chat.chatId;
  }

  /** Send a custom message to the session */
  sendMessage(
    message: { customType: string; content?: unknown; display?: unknown; details?: unknown },
    _options?: { triggerTurn?: boolean; deliverAs?: 'steer' | 'followUp' | 'nextTurn' },
  ): void {
    if (this.chat.disposed) return;
    // Append to chat history for now — the full sendMessage implementation
    // will be wired to the channel layer in a follow-up
    this.chat.history.push({
      role: 'custom',
      ...message,
    });
  }
}

/**
 * Return the subset of a tool registry visible at a given auth level, ordered by
 * tool name. Tools with no `minAuthLevel` (or below the level) are visible.
 */
export function applyAuthLevel(
  tools: Map<string, ToolDefinition>,
  level: AuthLevel
): ToolDefinition[] {
  const rank = AUTH_LEVEL_RANK[level] ?? 0;
  const out: ToolDefinition[] = [];
  for (const tool of tools.values()) {
    const need = AUTH_LEVEL_RANK[tool.minAuthLevel ?? 'anonymous'] ?? 0;
    if (rank >= need) out.push(tool);
  }
  return out;
}
