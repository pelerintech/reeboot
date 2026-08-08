/**
 * Reeboot Extension API
 *
 * SDK-agnostic interface that all extensions depend on. The pi SDK adapter
 * (`pi-adapter.ts`) implements this interface to bridge pi's ExtensionAPI.
 * Future SDK adapters (support, custom) implement the same interface,
 * enabling the same 17 extensions to run on any SDK.
 *
 * This interface captures only what extensions actually use — extracted
 * from analysis of all 17 bundled extensions. It is intentionally smaller
 * than pi's full ExtensionAPI to keep the surface minimal for future SDKs.
 */

// ─── Tool Types ──────────────────────────────────────────────────────────────

import type { ToolView } from '../structured-views.js';

/** Authentication levels used to gate tools for the multi-user backend. */
export const AUTH_LEVELS = ['anonymous', 'customer', 'admin'] as const;
export type AuthLevel = (typeof AUTH_LEVELS)[number];
export const AUTH_LEVEL_RANK: Record<AuthLevel, number> = {
  anonymous: 0,
  customer: 1,
  admin: 2,
};

/** Minimal tool definition — the subset all extensions need to register tools. */
export interface ToolDefinition<TParams = any, TDetails = unknown> {
  /** Tool name (used in LLM tool calls) */
  name: string;
  /** Human-readable label for UI */
  label: string;
  /** Description for LLM */
  description: string;
  /** Optional one-line snippet for the Available tools section in the default system prompt */
  promptSnippet?: string;
  /** Optional guideline bullets appended to the default system prompt Guidelines section */
  promptGuidelines?: string[];
  /** Minimum auth level required for this tool to be visible. Omitted = available to all (anonymous). */
  minAuthLevel?: AuthLevel;
  /** Parameter schema (TypeBox TSchema or plain JSON schema) */
  parameters: TParams;
  /** Execute the tool */
  execute(
    toolCallId: string,
    params: TParams,
    signal: AbortSignal | undefined,
    onUpdate: ((details: TDetails) => void) | undefined,
    ctx: ExtensionContext,
  ): Promise<ToolResult<TDetails>>;
}

/** Tool metadata returned by getAllTools() */
export interface ToolInfo {
  name: string;
  description: string;
  parameters: unknown;
  sourceInfo?: unknown;
}

/** Result returned from a tool execution */
export interface ToolResult<TDetails = unknown> {
  content: string | Array<{ type: string; text?: string; image?: { data: string; mimeType: string } }>;
  isError?: boolean;
  details?: TDetails;
  /** Optional structured view hint for rich WebChat rendering */
  view?: ToolView;
}

// ─── Extension Context ───────────────────────────────────────────────────────

/**
 * UI methods for user interaction (select, confirm, notify, etc.)
 * Provided by the SDK adapter from the host's UI context.
 */
export interface ExtensionUIContext {
  select(title: string, options: string[], opts?: { signal?: AbortSignal; timeout?: number }): Promise<string | undefined>;
  confirm(title: string, message: string, opts?: { signal?: AbortSignal; timeout?: number }): Promise<boolean>;
  input(title: string, placeholder?: string, opts?: { signal?: AbortSignal; timeout?: number }): Promise<string | undefined>;
  notify(message: string, type?: 'info' | 'warning' | 'error'): void;
}

/**
 * Context passed to extensions — SDK-agnostic metadata about the running session.
 * The adapter provides this from the SDK session's configuration and runtime.
 *
 * Includes only the properties that extensions actually use (extracted from
 * analysis of all 17 bundled extensions): ui, hasUI, cwd, sessionManager,
 * modelRegistry, plus the loader-provided workspacePath, config, db, scheduler.
 */
export interface ExtensionContext {
  /** Current working directory */
  cwd: string;
  /** Current workspace path */
  workspacePath: string;
  /** Reeboot configuration (subset relevant to extensions) */
  config: Record<string, any>;
  /** Database instance (if available; may be undefined in minimal deployments) */
  db?: any;
  /** Scheduler instance (if available; may be undefined in minimal deployments) */
  scheduler?: any;
  /** UI methods for user interaction (select, confirm, notify) */
  ui: ExtensionUIContext;
  /** Whether UI is available (false in headless/print/RPC mode) */
  hasUI: boolean;
  /** Session manager for reading session entries (used by confirm-destructive) */
  sessionManager?: any;
  /** Model registry for API key resolution and model info */
  modelRegistry?: any;
  /** True when this turn is a remote/restricted runner (owner-only tool gating). */
  restricted?: boolean;
}

// ─── Session Entry Types ───────────────────────────────────────────────────

/** Base entry in a session log (shared by all entry types) */
export interface SessionEntryBase {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
}

/** A message entry in a session (user, assistant, or tool result) */
export interface SessionMessageEntry extends SessionEntryBase {
  type: 'message';
  message: { role: string; content?: unknown };
}

// ─── Extension Factory ───────────────────────────────────────────────────────

/**
 * Extension factory function type.
 * Called by the loader with the ExtensionAPI to initialize the extension.
 */
export type ExtensionFactory = (api: ExtensionAPI) => void | Promise<void>;

// ─── Event Payload Types ─────────────────────────────────────────────────────

/** Fired before each LLM call. Extensions inject system prompt content. */
export interface BeforeAgentStartEvent {
  type: 'before_agent_start';
  /** The raw user prompt text (after expansion) */
  prompt: string;
  /** Images attached to the user prompt, if any */
  images?: unknown[];
  /** The fully assembled system prompt string */
  systemPrompt: string;
  /** Structured options used to build the system prompt */
  systemPromptOptions: Record<string, unknown>;
}

/** Result from before_agent_start handler — extensions can modify the system prompt */
export interface BeforeAgentStartEventResult {
  /** Replace the system prompt for this turn */
  systemPrompt?: string;
}

/** Fired when a session is started, loaded, or reloaded */
export interface SessionStartEvent {
  type: 'session_start';
  reason: 'startup' | 'reload' | 'new' | 'resume' | 'fork';
  previousSessionFile?: string;
}

/** Fired before switching to another session */
export interface SessionBeforeSwitchEvent {
  type: 'session_before_switch';
  reason: 'new' | 'resume';
  targetSessionFile?: string;
}

/** Result from session_before_switch handler */
export interface SessionBeforeSwitchEventResult {
  cancel?: boolean;
}

/** Fired before forking a session */
export interface SessionBeforeForkEvent {
  type: 'session_before_fork';
  entryId: string;
  position: 'before' | 'at';
}

/** Result from session_before_fork handler */
export interface SessionBeforeForkEventResult {
  cancel?: boolean;
  skipConversationRestore?: boolean;
}

/** Preparation data for context compaction */
export interface CompactionPreparation {
  messagesToSummarize: any[];
  turnPrefixMessages: any[];
  tokensBefore: number;
  firstKeptEntryId: string;
  previousSummary?: string;
}

/** Fired before context compaction */
export interface SessionBeforeCompactEvent {
  type: 'session_before_compact';
  preparation: CompactionPreparation;
  branchEntries: unknown[];
  customInstructions?: string;
  signal: AbortSignal;
}

/** Result from session_before_compact handler */
export interface SessionBeforeCompactEventResult {
  cancel?: boolean;
}

/** Fired after context compaction */
export interface SessionCompactEvent {
  type: 'session_compact';
  compactionEntry: unknown;
  fromExtension: boolean;
}

/** Fired when an extension runtime is torn down (SDK-agnostic reeboot event) */
export interface SessionShutdownEvent {
  type: 'session_shutdown';
  /** Session identifier */
  sessionId: string;
  /** Reason for shutdown */
  reason: 'quit' | 'reload' | 'new' | 'resume' | 'fork';
  /** Destination session file when shutting down due to session replacement */
  targetSessionFile?: string;
}

/** Fired before an extension runtime is torn down due to quit, reload, or session replacement */
export interface SessionBeforeTreeEvent {
  type: 'session_before_tree';
  preparation: unknown;
  signal: AbortSignal;
}

/** Result from session_before_tree handler */
export interface SessionBeforeTreeEventResult {
  cancel?: boolean;
}

/** Fired after navigating in the session tree */
export interface SessionTreeEvent {
  type: 'session_tree';
  newLeafId: string | null;
  oldLeafId: string | null;
  summaryEntry?: unknown;
  fromExtension?: boolean;
}

/** Fired after session_start to allow extensions to provide additional resource paths */
export interface ResourcesDiscoverEvent {
  type: 'resources_discover';
  cwd: string;
  reason: 'startup' | 'reload';
}

/** Result from resources_discover handler */
export interface ResourcesDiscoverResult {
  skillPaths?: string[];
  promptPaths?: string[];
  themePaths?: string[];
}

/** Fired when an agent loop starts */
export interface AgentStartEvent {
  type: 'agent_start';
}

/** Fired when an agent loop ends */
export interface AgentEndEvent {
  type: 'agent_end';
  messages: unknown[];
}

/** Fired at the start of each turn */
export interface TurnStartEvent {
  type: 'turn_start';
  turnIndex: number;
  timestamp: number;
}

/** Token usage data for a single turn (SDK-agnostic) */
export interface TurnUsage {
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Total cost in USD (may be 0 for local models) */
  cost?: number;
}

/** Fired at the end of each turn (SDK-agnostic reeboot event) */
export interface TurnEndEvent {
  type: 'turn_end';
  /** Stable turn identifier (SDK-agnostic — not all SDKs use numeric indices) */
  turnId: string;
  /** Session identifier */
  sessionId: string;
  /** Legacy numeric turn index (for backward compatibility) */
  turnIndex: number;
  /** The assistant's final message for this turn */
  message: unknown;
  /** Tool results produced during this turn */
  toolResults: unknown[];
  /** Token usage data extracted from the turn's assistant message */
  usage?: TurnUsage;
}

/** Fired when user executes a bash command via ! or !! prefix */
export interface UserBashEvent {
  type: 'user_bash';
  command: string;
  excludeFromContext: boolean;
  cwd: string;
}

/** Fired after a provider response is received (SDK-agnostic reeboot event) */
export interface AfterProviderResponseEvent {
  type: 'after_provider_response';
  /** Context identifier (e.g., 'main', 'support') */
  contextId: string;
  /** Model provider string (e.g., 'anthropic', 'openai') */
  provider: string;
  /** HTTP status code of the provider response */
  status: number;
  /** Response headers (rate limit headers, etc.) */
  headers: Record<string, string>;
}

/** Fired when a tool starts executing */
export interface ToolExecutionStartEvent {
  type: 'tool_execution_start';
  toolCallId: string;
  toolName: string;
  args: unknown;
}

/** Fired during tool execution with partial/streaming output */
export interface ToolExecutionUpdateEvent {
  type: 'tool_execution_update';
  toolCallId: string;
  toolName: string;
  args: unknown;
  partialResult: unknown;
}

/** Fired when a tool finishes executing */
export interface ToolExecutionEndEvent {
  type: 'tool_execution_end';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError: boolean;
}

/**
 * Fired before a tool executes. Can block execution.
 * Union of built-in tool call events and custom tool call events.
 */
export type ToolCallEvent =
  | { type: 'tool_call'; toolCallId: string; toolName: 'bash'; args: { command: string } }
  | { type: 'tool_call'; toolCallId: string; toolName: 'read'; args: { path: string } }
  | { type: 'tool_call'; toolCallId: string; toolName: 'edit'; args: { path: string } }
  | { type: 'tool_call'; toolCallId: string; toolName: 'write'; args: { path: string } }
  | { type: 'tool_call'; toolCallId: string; toolName: 'grep'; args: { pattern: string } }
  | { type: 'tool_call'; toolCallId: string; toolName: 'find'; args: { path: string } }
  | { type: 'tool_call'; toolCallId: string; toolName: 'ls'; args: { path: string } }
  | { type: 'tool_call'; toolCallId: string; toolName: string; args: Record<string, unknown> };

/*
 * NOTE: the tool-call argument field is named `args` (SDK-agnostic convention),
 * NOT pi's `input`. The adapter maps pi's `input` → reeboot's `args` in
 * transformEvent(). A future SDK adapter maps its own argument field to `args`.
 */

/** Result from tool_call handler — can block execution */
export interface ToolCallEventResult {
  block?: boolean;
  reason?: string;
}

/**
 * Fired after a tool executes. Can modify result.
 * SDK-agnostic reeboot event — adapter transforms SDK payload to this shape.
 */
export interface ToolResultEvent {
  type: 'tool_result';
  /** Unique tool call identifier */
  toolCallId: string;
  /** Name of the tool that was executed */
  toolName: string;
  /** Tool call arguments (preserved from the original tool call) */
  input: Record<string, unknown>;
  /** Result content */
  content: unknown[];
  /** Whether the tool execution resulted in an error */
  isError: boolean;
  /** Tool-specific details (optional, varies by tool) */
  details?: unknown;
}

/** Result from tool_result handler */
export interface ToolResultEventResult {
  content?: unknown[];
  details?: unknown;
  isError?: boolean;
}

/** Fired when a new model is selected */
export interface ModelSelectEvent {
  type: 'model_select';
  model: unknown;
  previousModel: unknown;
  source: 'set' | 'cycle' | 'restore';
}

/** Fired when user input is received */
export interface InputEvent {
  type: 'input';
  text: string;
  images?: unknown[];
  source: 'interactive' | 'rpc' | 'extension';
}

/** Result from input handler */
export type InputEventResult =
  | { action: 'continue' }
  | { action: 'transform'; text: string; images?: unknown[] }
  | { action: 'handled' };

/** Fired when a message starts */
export interface MessageStartEvent {
  type: 'message_start';
  message: unknown;
}

/** Fired during assistant message streaming */
export interface MessageUpdateEvent {
  type: 'message_update';
  message: unknown;
  assistantMessageEvent: unknown;
}

/** Fired when a message ends */
export interface MessageEndEvent {
  type: 'message_end';
  message: unknown;
}

/** Fired when a context event occurs */
export interface ContextEvent {
  type: 'context';
  messages: unknown[];
}

/** Result from context event handler */
export interface ContextEventResult {
  messages?: unknown[];
}

/** Fired before a provider request is sent */
export interface BeforeProviderRequestEvent {
  type: 'before_provider_request';
  payload: unknown;
}

/**
 * Typed event map — maps event names to their payload types.
 * This enables TypeScript to infer the correct payload type in handler functions.
 */
export interface ExtensionEventMap {
  'before_agent_start': BeforeAgentStartEvent;
  'session_start': SessionStartEvent;
  'session_before_switch': SessionBeforeSwitchEvent;
  'session_before_fork': SessionBeforeForkEvent;
  'session_before_compact': SessionBeforeCompactEvent;
  'session_compact': SessionCompactEvent;
  'session_shutdown': SessionShutdownEvent;
  'session_before_tree': SessionBeforeTreeEvent;
  'session_tree': SessionTreeEvent;
  'resources_discover': ResourcesDiscoverEvent;
  'agent_start': AgentStartEvent;
  'agent_end': AgentEndEvent;
  'turn_start': TurnStartEvent;
  'turn_end': TurnEndEvent;
  'user_bash': UserBashEvent;
  'after_provider_response': AfterProviderResponseEvent;
  'tool_execution_start': ToolExecutionStartEvent;
  'tool_execution_update': ToolExecutionUpdateEvent;
  'tool_execution_end': ToolExecutionEndEvent;
  'tool_call': ToolCallEvent;
  'tool_result': ToolResultEvent;
  'model_select': ModelSelectEvent;
  'input': InputEvent;
  'message_start': MessageStartEvent;
  'message_update': MessageUpdateEvent;
  'message_end': MessageEndEvent;
  'context': ContextEvent;
  'before_provider_request': BeforeProviderRequestEvent;
}

// ─── Handler Types ───────────────────────────────────────────────────────────

/**
 * Handler function type for events.
 * Generic over event payload E and optional result R.
 */
export type ExtensionHandler<E = unknown, R = void> = (
  event: E,
  ctx: ExtensionContext,
) => R | Promise<R | void> | void;

// ─── ExtensionAPI Interface ──────────────────────────────────────────────────

/**
 * The core extension API that all extensions depend on.
 *
 * SDK-agnostic: the pi adapter implements this interface to bridge
 * pi's ExtensionAPI. Future SDK adapters implement the same interface.
 *
 * Methods captured from analysis of all 17 bundled extensions:
 * - registerTool: used by ALL 17 extensions
 * - on: used by 12 extensions (event subscription)
 * - setSessionName: used by session-name extension
 * - getSessionName: used by session-name extension
 * - sendMessage: used by scheduler-tool extension
 */
export interface ExtensionAPI {
  /** Register a tool that the LLM can call */
  registerTool(tool: ToolDefinition): void;

  /** Register a custom slash command */
  registerCommand(name: string, options: {
    description?: string;
    handler: (args: string, ctx: ExtensionContext) => Promise<void> | void;
  }): void;

  /** Get all configured tools with metadata (name, description, parameters, source) */
  getAllTools(): ToolInfo[];

  /** Get the list of currently active tool names */
  getActiveTools(): string[];

  /**
   * Subscribe to an extension event.
   * Returns an unsubscribe function.
   *
   * @example
   * const unsub = api.on('before_agent_start', (event) => {
   *   return { systemPrompt: event.systemPrompt + '\n## My Extension' };
   * });
   * // Later: unsub();
   */
  on<K extends keyof ExtensionEventMap>(
    event: K,
    handler: ExtensionHandler<ExtensionEventMap[K], any>,
  ): () => void;

  // ─── Optional methods (only available when the SDK supports them) ───────

  /** Set the session display name (used by session-name extension) */
  setSessionName?(name: string): void;

  /** Get the current session name (used by session-name extension) */
  getSessionName?(): string | undefined;

  /** Get the current chat ID (ree mode) or undefined (pi mode) */
  getCurrentChatId?(): string | undefined;

  /** Send a custom message to the session (used by scheduler-tool extension) */
  sendMessage?(
    message: { customType: string; content?: unknown; display?: unknown; details?: unknown },
    options?: { triggerTurn?: boolean; deliverAs?: 'steer' | 'followUp' | 'nextTurn' },
  ): void;
}
