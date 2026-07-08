/**
 * ReeChat — per-chat state container for the ree SDK.
 *
 * Each chat is an isolated conversation with its own:
 * - EventEmitter (for reeboot-shaped extension events)
 * - Tool registry (per-chat tool instances)
 * - Message history (bounded by maxHistory, FIFO eviction)
 * - AbortController (per-chat cancellation)
 * - ReeExtensionAdapter (implements ExtensionAPI for this chat)
 *
 * The chat is created by ReeRuntime and disposed when idle or on explicit shutdown.
 */

import { EventEmitter } from 'events';
import type {
  ExtensionAPI,
  ExtensionContext,
  BeforeAgentStartEvent,
  TurnEndEvent,
  SessionShutdownEvent,
  ToolCallEvent,
  ToolResultEvent,
  AfterProviderResponseEvent,
  AgentEndEvent,
} from '../extensions/extension-api.js';
import { ReeExtensionAdapter } from '../extensions/ree-adapter.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReeChatOptions {
  /** Maximum number of messages to keep in memory (FIFO eviction) */
  maxHistory?: number;
  /** ExtensionContext for this chat */
  context: ExtensionContext;
  /** Reeboot config (shared across all chats) */
  config: Record<string, any>;
}

export interface MessageEntry {
  role: string;
  content: unknown;
  [key: string]: unknown;
}

export interface TurnEndPayload {
  turnId: string;
  turnIndex: number;
  message: unknown;
  toolResults: unknown[];
  usage?: { inputTokens: number; outputTokens: number; cost?: number };
}

export interface ToolCallPayload {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResultPayload {
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  content: unknown[];
  isError: boolean;
  details?: unknown;
}

export interface AfterProviderResponsePayload {
  contextId: string;
  provider: string;
  status: number;
  headers: Record<string, string>;
}

export interface AgentEndPayload {
  messages: unknown[];
}

export interface BeforeAgentStartPayload {
  prompt: string;
  systemPrompt: string;
  systemPromptOptions: Record<string, unknown>;
}

// ─── ReeChat ─────────────────────────────────────────────────────────────────

export class ReeChat {
  /** Unique chat identifier */
  public readonly chatId: string;

  /** Session identifier (same as chatId for ree) */
  public readonly sessionId: string;

  /** Event emitter for reeboot-shaped extension events */
  public readonly emitter: EventEmitter;

  /** Per-chat tool registry (name → ToolDefinition) */
  public readonly tools: Map<string, any>;

  /** Bounded message history (FIFO eviction) */
  public history: MessageEntry[];

  /** Per-chat AbortController for cancellation */
  public readonly abortController: AbortController;

  /** Outgoing message queue (for sendMessage) */
  public outgoingQueue: unknown[];

  /** Registered slash commands */
  public commands: Map<string, { description?: string; handler: (args: string, ctx: ExtensionContext) => Promise<void> | void }>;

  /** Current session display name */
  public sessionName: string | undefined;

  /** Whether this chat has been disposed */
  public disposed: boolean;

  /** Promise that resolves when extension factories have initialized (best-effort). */
  public extensionsReady: Promise<void> = Promise.resolve();

  /** Last activity timestamp (for idle eviction) */
  public lastActivityAt: number;

  /** Maximum history length */
  private readonly _maxHistory: number;

  /** ExtensionContext for this chat */
  private readonly _context: ExtensionContext;

  /** The adapter instance for this chat */
  private _adapter: ReeExtensionAdapter;

  constructor(chatId: string, options: ReeChatOptions) {
    this.chatId = chatId;
    this.sessionId = chatId;
    this.emitter = new EventEmitter();
    this.tools = new Map();
    this.commands = new Map();
    this.history = [];
    this.abortController = new AbortController();
    this.outgoingQueue = [];
    this.sessionName = undefined;
    this.disposed = false;
    this.lastActivityAt = Date.now();
    this._maxHistory = options.maxHistory ?? 50;
    this._context = options.context;

    // Create the adapter bound to this chat
    this._adapter = new ReeExtensionAdapter(this, options.context);
  }

  /**
   * The ExtensionAPI adapter for this chat.
   * Extensions receive this adapter and interact with the chat through it.
   */
  get adapter(): ExtensionAPI {
    return this._adapter;
  }

  /**
   * Append a message to the chat history with FIFO eviction.
   * When history exceeds maxHistory, the oldest messages are removed.
   */
  appendMessage(message: MessageEntry): void {
    this.history.push(message);
    while (this.history.length > this._maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Update the last activity timestamp (called on each prompt).
   */
  touch(): void {
    this.lastActivityAt = Date.now();
  }

  // ─── Typed emit helpers ──────────────────────────────────────────────────

  /** Emit before_agent_start event */
  emitBeforeAgentStart(payload: BeforeAgentStartPayload): void {
    const event: BeforeAgentStartEvent = {
      type: 'before_agent_start',
      prompt: payload.prompt,
      systemPrompt: payload.systemPrompt,
      systemPromptOptions: payload.systemPromptOptions,
    };
    this.emitter.emit('before_agent_start', event);
  }

  /** Emit turn_end event */
  emitTurnEnd(payload: TurnEndPayload): void {
    const event: TurnEndEvent = {
      type: 'turn_end',
      turnId: payload.turnId,
      sessionId: this.sessionId,
      turnIndex: payload.turnIndex,
      message: payload.message,
      toolResults: payload.toolResults,
      ...(payload.usage ? { usage: payload.usage } : {}),
    };
    this.emitter.emit('turn_end', event);
  }

  /** Emit session_shutdown event */
  emitSessionShutdown(reason: SessionShutdownEvent['reason']): void {
    const event: SessionShutdownEvent = {
      type: 'session_shutdown',
      sessionId: this.sessionId,
      reason,
    };
    this.emitter.emit('session_shutdown', event);
  }

  /** Emit tool_call event */
  emitToolCall(payload: ToolCallPayload): void {
    const event: ToolCallEvent = {
      type: 'tool_call',
      toolCallId: payload.toolCallId,
      toolName: payload.toolName,
      args: payload.args,
    };
    this.emitter.emit('tool_call', event);
  }

  /** Emit tool_result event */
  emitToolResult(payload: ToolResultPayload): void {
    const event: ToolResultEvent = {
      type: 'tool_result',
      toolCallId: payload.toolCallId,
      toolName: payload.toolName,
      input: payload.input,
      content: payload.content,
      isError: payload.isError,
      ...(payload.details !== undefined ? { details: payload.details } : {}),
    };
    this.emitter.emit('tool_result', event);
  }

  /** Emit after_provider_response event */
  emitAfterProviderResponse(payload: AfterProviderResponsePayload): void {
    const event: AfterProviderResponseEvent = {
      type: 'after_provider_response',
      contextId: payload.contextId,
      provider: payload.provider,
      status: payload.status,
      headers: payload.headers,
    };
    this.emitter.emit('after_provider_response', event);
  }

  /** Emit agent_end event */
  emitAgentEnd(payload: AgentEndPayload): void {
    const event: AgentEndEvent = {
      type: 'agent_end',
      messages: payload.messages,
    };
    this.emitter.emit('agent_end', event);
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Dispose this chat permanently.
   * Emits session_shutdown, removes all listeners, clears state.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Emit session_shutdown before cleanup
    this.emitSessionShutdown('quit');

    // Remove all listeners
    this.emitter.removeAllListeners();

    // Clear state
    this.history = [];
    this.tools.clear();
  }

  /**
   * Reset this chat for a new session.
   * Emits session_shutdown with reason 'new', clears history.
   */
  reset(): void {
    this.emitSessionShutdown('new');
    this.history = [];

    // Reset abort controller for the new session
    this.abortController.abort();
    // Note: we don't create a new AbortController here — the runner
    // should create a fresh one for the next prompt if needed.
  }
}
