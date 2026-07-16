/**
 * Pi Extension Adapter
 *
 * Bridges pi SDK's ExtensionAPI to reeboot's SDK-agnostic ExtensionAPI.
 * The loader creates one adapter per session and passes it to all extensions.
 *
 * Responsibilities:
 * 1. Map reeboot event names to pi event names (mostly identity mapping)
 * 2. Forward registerTool() calls to pi's registerTool()
 * 3. Forward optional methods (setSessionName, getSessionName, sendMessage) to pi
 * 4. Provide ExtensionContext (workspacePath, config, db, scheduler)
 * 5. Transform pi's SDK-specific event payloads to reeboot's typed events
 *
 * Event payload transformation strategy:
 * - Events that need transformation (turn_end, tool_result, session_shutdown,
 *   after_provider_response) have explicit mapping logic in transformEvent().
 * - Events with identical shapes (before_agent_start, agent_start, agent_end,
 *   tool_call, session_start, etc.) pass through unchanged.
 * - The adapter extracts SDK-specific fields (turnIndex, AgentMessage usage)
 *   and maps them to reeboot's SDK-agnostic fields (turnId, TurnUsage).
 * - Future SDK adapters follow the same pattern: SDK payload → reeboot event shape.
 */

import type {
  ExtensionAPI,
  ExtensionEventMap,
  ExtensionContext,
  ExtensionHandler,
  ToolDefinition,
} from './extension-api.js';

/**
 * PiExtensionAdapter implements reeboot's ExtensionAPI by delegating to
 * pi's ExtensionAPI. Extensions depend on this interface, not pi directly.
 */
export class PiExtensionAdapter implements ExtensionAPI {
  /** The underlying pi SDK ExtensionAPI */
  private readonly pi: any;

  /** SDK-agnostic context provided by the loader */
  readonly context: ExtensionContext;

  /** Internal handler registry for potential future unsubscribe support */
  private readonly _handlers = new Map<string, ExtensionHandler<any, any>[]>();

  constructor(piSession: any, context: ExtensionContext) {
    this.pi = piSession;
    this.context = context;
  }

  /**
   * Register a tool with the pi SDK.
   * Forwards the tool definition directly — pi's ToolDefinition is compatible
   * with our subset (name, label, description, parameters, execute).
   */
  registerTool(tool: ToolDefinition): void {
    if (!this.pi) {
      throw new Error('Cannot registerTool: pi session not available (adapter created without a session)');
    }
    this.pi.registerTool(tool);
  }

  /** Get all configured tools with metadata */
  getAllTools(): import('./extension-api.js').ToolInfo[] {
    if (typeof this.pi.getAllTools === 'function') {
      return this.pi.getAllTools() as import('./extension-api.js').ToolInfo[];
    }
    return [];
  }

  /** Get the list of currently active tool names */
  getActiveTools(): string[] {
    if (typeof this.pi.getActiveTools === 'function') {
      return this.pi.getActiveTools();
    }
    return [];
  }

  /** Register a custom slash command */
  registerCommand(name: string, options: {
    description?: string;
    handler: (args: string, ctx: ExtensionContext) => Promise<void> | void;
  }): void {
    if (typeof this.pi.registerCommand === 'function') {
      this.pi.registerCommand(name, options as any);
    }
  }

  /**
   * Subscribe to a pi event and transform the payload to reeboot's typed event.
   *
   * Returns an unsubscribe function. Note: pi's on() returns void (no native
   * unsubscribe), so this returns a no-op function. The pi SDK handles handler
   * cleanup during session lifecycle events (session_shutdown, reload).
   */
  on<K extends keyof ExtensionEventMap>(
    event: K,
    handler: ExtensionHandler<ExtensionEventMap[K]>,
  ): () => void {
    if (!this.pi) {
      throw new Error(`Cannot subscribe to '${String(event)}': pi session not available (adapter created without a session)`);
    }

    // Store handler for potential future unsubscribe support
    const handlers = this._handlers.get(event as string) ?? [] as ExtensionHandler<any, any>[];
    handlers.push(handler as ExtensionHandler<any, any>);
    this._handlers.set(event, handlers);

    // Forward to pi's event system
    // Pi's on() returns void — we return a no-op unsubscribe
    // Cast handler to pi's ExtensionHandler type (pi uses 'any' for event params)
    this.pi.on(event, async (piEvent: any, piCtx: any) => {
      // Transform pi event payload to reeboot typed event
      const reebootEvent = this.transformEvent(event, piEvent);

      // Build reeboot ExtensionContext from pi context if needed
      const reebootCtx = this.buildContext(piCtx);

      return (handler as ExtensionHandler)(reebootEvent, reebootCtx);
    });

    // Return no-op unsubscribe (pi doesn't support per-handler unsubscribe)
    return () => {
      // No-op: pi handles cleanup during session lifecycle events
    };
  }

  /**
   * Set the session display name.
   * Forwards to pi's setSessionName if available.
   */
  setSessionName(name: string): void {
    if (!this.pi) return;
    if (typeof this.pi.setSessionName === 'function') {
      this.pi.setSessionName(name);
    }
  }

  /**
   * Get the current chat ID.
   * Pi mode has no per-chat concept — always returns undefined.
   */
  getCurrentChatId(): string | undefined {
    return undefined;
  }

  /**
   * Get the current session name.
   * Forwards to pi's getSessionName if available.
   */
  getSessionName(): string | undefined {
    if (!this.pi) return undefined;
    if (typeof this.pi.getSessionName === 'function') {
      return this.pi.getSessionName();
    }
    return undefined;
  }

  /**
   * Send a custom message to the session.
   * Forwards to pi's sendMessage if available.
   */
  sendMessage(
    message: { customType: string; content?: unknown; display?: unknown; details?: unknown },
    options?: { triggerTurn?: boolean; deliverAs?: 'steer' | 'followUp' | 'nextTurn' },
  ): void {
    if (!this.pi) return;
    if (typeof this.pi.sendMessage === 'function') {
      this.pi.sendMessage(message, options);
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────

  /**
   * Transform a pi event payload to reeboot's typed event format.
   *
   * This is the core of the adapter: it maps pi's SDK-specific event shapes
   * to reeboot's SDK-agnostic event types. Each event type that diverges from
   * pi's shape has explicit transformation logic. Events with identical shapes
   * pass through unchanged.
   *
   * Future SDK adapters implement the same pattern: SDK payload → reeboot event.
   */
  private transformEvent<K extends keyof ExtensionEventMap>(
    eventName: K,
    piEvent: any,
  ): ExtensionEventMap[K] {
    switch (eventName) {
      // ── Events that need transformation ──────────────────────────────

      case 'turn_end': {
        // Pi: { turnIndex: number, message: AgentMessage, toolResults: ToolResultMessage[] }
        // Reeboot: { turnId: string, sessionId: string, turnIndex: number, message, toolResults, usage? }
        const msg = piEvent.message as any;
        const usage = this._extractUsage(msg);
        return {
          type: 'turn_end',
          turnId: String(piEvent.turnIndex ?? 0),
          sessionId: this._getSessionId(),
          turnIndex: piEvent.turnIndex ?? 0,
          message: msg,
          toolResults: piEvent.toolResults ?? [],
          ...(usage ? { usage } : {}),
        } as ExtensionEventMap[K];
      }

      case 'tool_result': {
        // Pi: ToolResultEvent has input in base, but reeboot's old type was a union missing it
        // Ensure input is always present for reeboot's typed interface
        return {
          type: 'tool_result',
          toolCallId: piEvent.toolCallId,
          toolName: piEvent.toolName,
          input: piEvent.input ?? {},
          content: piEvent.content ?? [],
          isError: piEvent.isError ?? false,
          ...(piEvent.details !== undefined ? { details: piEvent.details } : {}),
        } as ExtensionEventMap[K];
      }

      case 'session_shutdown': {
        // Pi: { reason, targetSessionFile? }
        // Reeboot: { sessionId, reason, targetSessionFile? }
        return {
          type: 'session_shutdown',
          sessionId: this._getSessionId(),
          reason: piEvent.reason ?? 'quit',
          ...(piEvent.targetSessionFile ? { targetSessionFile: piEvent.targetSessionFile } : {}),
        } as ExtensionEventMap[K];
      }

      case 'after_provider_response': {
        // Pi: { status, headers }
        // Reeboot: { contextId, provider, status, headers }
        return {
          type: 'after_provider_response',
          contextId: this._getContextId(),
          provider: this._getProvider(),
          status: piEvent.status ?? 0,
          headers: piEvent.headers ?? {},
        } as ExtensionEventMap[K];
      }

      case 'tool_call': {
        // Pi: { type, toolCallId, toolName, input }
        // Reeboot: { type, toolCallId, toolName, args }
        // Map pi's `input` → reeboot's `args` (SDK-agnostic convention).
        return {
          type: 'tool_call',
          toolCallId: piEvent.toolCallId,
          toolName: piEvent.toolName,
          args: piEvent.input ?? {},
        } as ExtensionEventMap[K];
      }

      // ── Events that pass through (identical shapes) ──────────────────
      // These events have the same field names and structures in both
      // pi and reeboot. The cast is safe because the types are aligned.

      default:
        return piEvent as ExtensionEventMap[K];
    }
  }

  /**
   * Extract TurnUsage from pi's AgentMessage usage field.
   * Pi's AgentMessage.usage has { inputTokens, outputTokens, cost?: { total?: number } }.
   */
  private _extractUsage(msg: any): import('./extension-api.js').TurnUsage | null {
    if (!msg?.usage) return null;
    const inputTokens = msg.usage.inputTokens ?? 0;
    const outputTokens = msg.usage.outputTokens ?? 0;
    if (inputTokens === 0 && outputTokens === 0) return null;

    return {
      inputTokens,
      outputTokens,
      ...(msg.usage.cost?.total !== undefined ? { cost: msg.usage.cost.total } : {}),
    };
  }

  /**
   * Derive session ID from context.
   * Uses the workspace path basename as a stable identifier.
   */
  private _getSessionId(): string {
    // Session ID is derived from the session file or falls back to context ID
    // For now, use context ID as the session identifier
    return this._getContextId();
  }

  /**
   * Derive context ID from workspace path.
   * cwd is ~/.reeboot/contexts/<contextId>/workspace → extract contextId
   */
  private _getContextId(): string {
    const cwd = this.context.workspacePath;
    // ~/.reeboot/contexts/<contextId>/workspace
    const parts = cwd.split('/');
    const idx = parts.indexOf('contexts');
    if (idx >= 0 && idx + 1 < parts.length) {
      return parts[idx + 1];
    }
    return 'main';
  }

  /**
   * Get the model provider string from config.
   */
  private _getProvider(): string {
    return (this.context.config as any)?.agent?.model?.provider ?? 'unknown';
  }

  /**
   * Build a reeboot ExtensionContext from pi's context.
   * Merges loader-provided context (workspacePath, config, db, scheduler)
   * with pi's runtime context (ui, hasUI, cwd, sessionManager, modelRegistry).
   */
  private buildContext(piCtx: any): ExtensionContext {
    // Start with loader-provided base context
    const base = {
      workspacePath: this.context.workspacePath,
      config: this.context.config,
      db: this.context.db,
      scheduler: this.context.scheduler,
    };

    // Merge pi's runtime context properties that extensions actually use
    return {
      ...base,
      cwd: piCtx?.cwd ?? this.context.workspacePath,
      ui: piCtx?.ui ?? { select: async () => undefined, confirm: async () => false, input: async () => undefined, notify: () => {} },
      hasUI: piCtx?.hasUI ?? false,
      sessionManager: piCtx?.sessionManager,
      modelRegistry: piCtx?.modelRegistry,
    } as ExtensionContext;
  }
}
