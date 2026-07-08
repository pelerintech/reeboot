/**
 * ReeRuntime — shared singleton hosting N concurrent ReeChats.
 *
 * Responsibilities:
 * - Chat registry: Map<chatId, ReeChat>
 * - Create, track, and dispose chats
 * - Bounded memory: idle eviction (LRU + TTL), maxChats cap
 * - Shared resources: TanStack AI model client config, extension factories
 * - Per-chat history persistence (via ree-history.ts)
 */

import type { ExtensionContext, ExtensionFactory } from '../extensions/extension-api.js';
import type Database from 'better-sqlite3';
import { ReeChat } from './ree-chat.js';
import {
  runReeHistoryMigration,
  initReeHistory,
  upsertChat,
  markChatDisposed,
  persistTurn,
  loadHistory,
  pruneHistory,
} from './ree-history.js';
import { openaiText, createOpenaiChat } from '@tanstack/ai-openai';
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible';
import { anthropicText } from '@tanstack/ai-anthropic';
import { groqText } from '@tanstack/ai-groq';
import { resolveProviderEnvKey } from '../agent-runner/pi-runner.js';
import { getLogger } from '../observability/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReeRuntimeOptions {
  /** Reeboot config (shared across all chats) */
  config: Record<string, any>;
  /** Maximum number of concurrent chats */
  maxChats?: number;
  /** Idle TTL in milliseconds — chats with no activity beyond this are evicted */
  idleTtlMs?: number;
  /** Maximum history entries per chat */
  maxHistoryPerChat?: number;
  /** Optional DB path for the per-chat history store (durable SQLite file). */
  dbPath?: string;
  /** Optional pre-opened DB handle for the history store (test seam). */
  db?: Database.Database;
}

export interface CreateChatOptions {
  /** ExtensionContext for this chat */
  context: ExtensionContext;
}

// ─── ReeRuntime ──────────────────────────────────────────────────────────────

export class ReeRuntime {
  /** Chat registry: chatId → ReeChat */
  private readonly _chats = new Map<string, ReeChat>();

  /** Shared config */
  public readonly config: Record<string, any>;

  /** Maximum number of concurrent chats */
  private readonly _maxChats: number;

  /** Idle TTL in milliseconds */
  private readonly _idleTtlMs: number;

  /** Maximum history entries per chat */
  private readonly _maxHistoryPerChat: number;

  /** Extension factory list (loaded once) */
  private _factories: ExtensionFactory[];

  /** Per-chat history store DB handle (lazily resolved when not provided). */
  private _historyDb: Database.Database | undefined;
  /** DB path for the history store (when provided via options). */
  private readonly _dbPath?: string;
  /** Whether history-store DB resolution has been attempted. */
  private _historyDbResolved = false;

  /** MCP clients (shared at runtime level, not per-chat) */
  private _mcpClients: unknown[] | undefined;

  /** Whether MCP clients have been initialized from config */
  private _mcpInitialized = false;

  constructor(options: ReeRuntimeOptions) {
    this.config = options.config;
    this._maxChats = options.maxChats ?? 200;
    this._idleTtlMs = options.idleTtlMs ?? 1800000; // 30 min
    this._maxHistoryPerChat = options.maxHistoryPerChat ?? 50;
    this._factories = [];

    // Resolve the history-store DB eagerly when an explicit handle or path is
    // provided. When neither is given (production via createRunner), the DB is
    // resolved lazily from the reeboot better-sqlite3 singleton on first use —
    // matching the graceful-degradation pattern used by observability.
    if (options.db) {
      this._historyDb = options.db;
      try { runReeHistoryMigration(this._historyDb); } catch { /* ignore migration errors */ }
      this._historyDbResolved = true;
    } else if (options.dbPath) {
      this._dbPath = options.dbPath;
      try {
        this._historyDb = initReeHistory(options.dbPath);
        this._historyDbResolved = true;
      } catch (err) {
        getLogger().warn({ err }, 'ree-runtime: failed to init history store');
      }
    }
  }

  /** Number of active chats */
  get chatCount(): number {
    return this._chats.size;
  }

  /** Extension factory list */
  get factories(): ExtensionFactory[] {
    return this._factories;
  }

  /** Set the extension factories (called by createRunner) */
  setFactories(factories: ExtensionFactory[]): void {
    this._factories = factories;
  }

  /**
   * Create a new chat or return an existing one.
   * Enforces maxChats by evicting the oldest idle chat if needed.
   */
  getOrCreateChat(chatId: string, options: CreateChatOptions): ReeChat {
    const existing = this._chats.get(chatId);
    if (existing) {
      existing.touch();
      return existing;
    }
    return this.createChat(chatId, options);
  }

  /**
   * Create a new chat.
   * If maxChats is reached, evicts the oldest idle chat first.
   */
  createChat(chatId: string, options: CreateChatOptions): ReeChat {
    // Enforce maxChats — evict oldest idle if at capacity
    if (this._chats.size >= this._maxChats) {
      this._evictOldestIdle();
    }

    // Ensure all chats share the runtime's config (not the caller's context.config)
    const chatContext: ExtensionContext = {
      ...options.context,
      config: this.config,
    };

    const chat = new ReeChat(chatId, {
      maxHistory: this._maxHistoryPerChat,
      context: chatContext,
      config: this.config,
    });

    // Hydrate the chat's in-memory history from the durable store (resume).
    // Rows are stored with JSON-encoded content; parse back to the original.
    this._loadHistoryIntoChat(chat);

    // Initialize the ree-relevant extension subset against this chat's adapter.
    // Each factory registers handlers/tools/commands on the chat's adapter.
    // Best-effort: a failing factory is logged, not thrown, so one bad
    // extension cannot break chat creation (matching the observability
    // graceful-degradation pattern). The promise is stored on the chat so
    // `prompt()` can await it before running the agent loop.
    chat.extensionsReady = this._initExtensions(chat);

    this._chats.set(chatId, chat);
    return chat;
  }

  /**
   * Run the extension factories against a chat's adapter.
   * Called once per chat at creation time. Returns a promise that resolves
   * when all factories have completed (best-effort — failures are logged).
   */
  private async _initExtensions(chat: ReeChat): Promise<void> {
    if (this._factories.length === 0) return;
    const adapter = chat.adapter;
    for (const factory of this._factories) {
      try {
        await factory(adapter);
      } catch (err) {
        getLogger().warn({ err, chatId: chat.chatId }, 'ree-runtime: extension factory failed');
      }
    }
  }

  /**
   * Get a chat by ID.
   */
  getChat(chatId: string): ReeChat | undefined {
    return this._chats.get(chatId);
  }

  /**
   * Dispose a chat by ID.
   * Calls chat.dispose() and removes from registry.
   *
   * On idle eviction (reason 'idle') the chat's persisted history is PRUNED so
   * a resumed chat starts empty. On explicit dispose the history is PRESERVED
   * (marked disposed) so resume works across voluntary restarts.
   */
  disposeChat(chatId: string, reason?: 'idle' | 'explicit'): void {
    const chat = this._chats.get(chatId);
    if (chat) {
      chat.dispose();
      this._chats.delete(chatId);

      // Persisted-history lifecycle. Idle eviction prunes; explicit dispose keeps.
      const db = this._getHistoryDb();
      if (db) {
        try {
          if (reason === 'idle') {
            pruneHistory(db, chatId);
          } else {
            markChatDisposed(db, chatId);
          }
        } catch (err) {
          getLogger().warn({ err, chatId }, 'ree-runtime: history lifecycle write failed');
        }
      }
    }
  }

  /**
   * Shut down the runtime — dispose all chats and close MCP clients.
   */
  shutdown(): void {
    for (const [chatId] of this._chats) {
      this.disposeChat(chatId);
    }
    // Close MCP clients (best-effort, async)
    if (this._mcpClients) {
      for (const client of this._mcpClients) {
        try {
          (client as any)?.close?.();
        } catch { /* ignore */ }
      }
    }
  }

  /**
   * Sweep idle chats — dispose any chat whose lastActivityAt
   * exceeds the idle TTL.
   */
  sweepIdle(): void {
    const now = Date.now();
    for (const [chatId, chat] of this._chats) {
      if (now - chat.lastActivityAt > this._idleTtlMs) {
        this.disposeChat(chatId, 'idle');
      }
    }
  }

  // ─── Per-chat history store (reeboot-owned) ───────────────────────────────

  /**
   * Resolve the history-store DB handle from the reeboot better-sqlite3
   * singleton (production path). Called lazily by the runner before the
   * first prompt. When an explicit db/dbPath was provided at construction,
   * the handle is already open and this is a no-op.
   *
   * Deployments without an initialised DB degrade gracefully — persistence
   * becomes a no-op (matching the observability pattern).
   */
  async initHistoryDb(): Promise<void> {
    if (this._historyDbResolved) return;
    this._historyDbResolved = true;
    try {
      const { getDb } = await import('../db/index.js');
      const db = getDb();
      runReeHistoryMigration(db);
      this._historyDb = db;
    } catch (err) {
      getLogger().warn({ err }, 'ree-runtime: history store DB unavailable; persistence disabled');
    }
  }

  /**
   * Synchronous accessor for the resolved history-store DB handle.
   * Returns undefined when no DB is available (construction-provided handle,
   * or after initHistoryDb resolved/failed). Callers must tolerate undefined.
   */
  private _getHistoryDb(): Database.Database | undefined {
    return this._historyDb;
  }

  /**
   * Hydrate a newly-created chat's in-memory history from the durable store.
   * Called on chat creation (including resume after explicit dispose).
   */
  private _loadHistoryIntoChat(chat: ReeChat): void {
    const db = this._getHistoryDb();
    if (!db) return;
    try {
      const rows = loadHistory(db, chat.chatId, this._maxHistoryPerChat);
      for (const row of rows) {
        let content: unknown = row.content;
        try { content = JSON.parse(row.content); } catch { /* keep raw string */ }
        chat.appendMessage({ role: row.role, content });
      }
    } catch (err) {
      getLogger().warn({ err, chatId: chat.chatId }, 'ree-runtime: history load failed');
    }
  }

  /**
   * Persist a completed turn (user message + assistant response) to the
   * durable per-chat history store. Called by ReeAgentRunner.prompt() after
   * the agent loop resolves successfully.
   */
  persistTurn(
    chatId: string,
    userMsg: { role: string; content: unknown },
    assistantMsg: { role: string; content: unknown },
  ): void {
    const db = this._getHistoryDb();
    if (!db) return;
    try {
      upsertChat(db, chatId);
      persistTurn(db, chatId, userMsg, assistantMsg);
    } catch (err) {
      getLogger().warn({ err, chatId }, 'ree-runtime: persistTurn failed');
    }
  }

  /**
   * MCP clients for the TanStack chat() call.
   * Returns undefined when no MCP servers are configured.
   * Lazily initializes clients from config.ree.mcp.servers on first access.
   */
  getMcpClients(): unknown[] | undefined {
    if (!this._mcpInitialized) {
      this._mcpInitialized = true; // prevent re-entry
      this._initMcpClientsSync();
    }
    return this._mcpClients;
  }

  /**
   * Inject pre-built MCP clients (test-only seam).
   * In production, clients are created from config.ree.mcp.servers.
   */
  setMcpClients(clients: unknown[]): void {
    this._mcpClients = clients;
    this._mcpInitialized = true;
  }

  /**
   * Create MCP clients from config.ree.mcp.servers (synchronous setup, async connect).
   * Each server config is { name, command, args, env } (same shape as mcp-manager).
   * Translated to TanStack stdio transport: { type: 'stdio', command, args, env }.
   */
  private _initMcpClientsSync(): void {
    const reeConfig = (this.config as any)?.ree ?? {};
    const servers = reeConfig.mcp?.servers ?? (this.config as any)?.mcp?.servers ?? [];
    if (!Array.isArray(servers) || servers.length === 0) return;

    // Build MCP client promises — each is async (connects to the server)
    // We store the promises; the runtime resolves them lazily.
    // For v1, we create the clients eagerly in the background.
    this._mcpClientPromises = servers.map(async (server: any) => {
      const { createMCPClient } = await import('@tanstack/ai-mcp');
      return createMCPClient({
        transport: {
          type: 'stdio',
          command: server.command,
          args: server.args ?? [],
          env: server.env,
        },
        prefix: server.name,
      });
    });
  }

  /** Pending MCP client creation promises (resolved lazily) */
  private _mcpClientPromises: Promise<unknown>[] | undefined;

  /**
   * Initialize MCP clients from config and await their connection.
   * Called by the runner before the first prompt if MCP servers are configured.
   */
  async initMcpClients(): Promise<void> {
    if (this._mcpInitialized) return;
    this._mcpInitialized = true;
    this._initMcpClientsSync();
    if (this._mcpClientPromises && this._mcpClientPromises.length > 0) {
      try {
        this._mcpClients = await Promise.all(this._mcpClientPromises);
      } catch (err) {
        getLogger().warn({ err }, 'ree-runtime: failed to init some MCP clients');
        // Best-effort: keep whatever clients succeeded
        const results = await Promise.allSettled(this._mcpClientPromises);
        this._mcpClients = results
          .filter((r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled')
          .map((r) => r.value);
        if (this._mcpClients.length === 0) this._mcpClients = undefined;
      }
    }
  }

  /**
   * Build a real TanStack AI model adapter from `config.ree.model`.
   *
   * Provider resolution:
   *   'openai'    → openaiText (Responses API)
   *   'anthropic' → anthropicText
   *   'groq'      → groqText
   *   'ollama'/'lmstudio'/'custom' → openaiCompatibleText (Chat Completions)
   *
   * API keys resolve from config.ree.model.apiKey or resolveProviderEnvKey().
   * Extra client options (baseURL, fetch, etc.) pass through from config.
   */
  createTanStackClient(): unknown {
    const reeConfig = (this.config as any)?.ree ?? {};
    const modelConfig = reeConfig.model ?? (this.config as any)?.agent?.model ?? {};
    const provider = String(modelConfig.provider ?? 'openai').toLowerCase();
    const modelId = String(modelConfig.id ?? 'gpt-4o');
    const apiKey = modelConfig.apiKey ?? resolveProviderEnvKey(provider) ?? 'no-key';

    // Collect extra client options (pass-through, e.g. baseURL, fetch for tests)
    const extraOpts: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(modelConfig)) {
      if (!['provider', 'id', 'apiKey', 'baseUrl', 'maxIterations'].includes(k)) {
        extraOpts[k] = v;
      }
    }

    switch (provider) {
      case 'openai': {
        const opts: Record<string, unknown> = { ...extraOpts };
        if (modelConfig.baseUrl) opts.baseURL = modelConfig.baseUrl;
        // createOpenaiChat takes apiKey explicitly; openaiText reads from env.
        // Prefer explicit key when provided, fall back to env resolution.
        if (modelConfig.apiKey || resolveProviderEnvKey(provider)) {
          return createOpenaiChat(modelId as any, apiKey, opts as any);
        }
        return openaiText(modelId as any, opts as any);
      }
      case 'anthropic':
        return anthropicText(modelId as any, { apiKey, ...extraOpts } as any);
      case 'groq':
        return groqText(modelId as any, { apiKey, ...extraOpts } as any);
      case 'ollama':
      case 'lmstudio':
      case 'custom': {
        return openaiCompatibleText(modelId, {
          baseURL: modelConfig.baseUrl ?? 'http://localhost:11434/v1',
          apiKey,
          ...extraOpts,
        } as any);
      }
      default:
        throw new Error(`Unknown ree model provider: ${provider}`);
    }
  }

  /**
   * Evict the oldest idle chat (lowest lastActivityAt).
   * Used when maxChats is reached and a new chat needs to be created.
   */
  private _evictOldestIdle(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [chatId, chat] of this._chats) {
      if (chat.lastActivityAt < oldestTime) {
        oldestTime = chat.lastActivityAt;
        oldestId = chatId;
      }
    }

    if (oldestId !== null) {
      // Treated as idle eviction — history is pruned, matching sweepIdle.
      this.disposeChat(oldestId, 'idle');
    }
  }
}
