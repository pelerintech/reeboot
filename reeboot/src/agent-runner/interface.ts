// ─── RunnerEvent ─────────────────────────────────────────────────────────────
// Discriminated union of events forwarded from the pi AgentSession to callers.
// These intentionally use simple field names independent of pi SDK internals.

export type RunnerEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call_start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_call_end'; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: 'message_end'; runId: string; usage: { input: number; output: number } }
  | { type: 'error'; message: string };

// ─── AgentRunner ─────────────────────────────────────────────────────────────

export type MessageTrust = 'owner' | 'end-user';

export interface AgentRunner {
  /**
   * Send a user message to the agent. Calls onEvent for each RunnerEvent as
   * they arrive. Resolves when the turn completes (message_end received).
   */
  prompt(content: string, onEvent: (event: RunnerEvent) => void, options?: { trust?: MessageTrust }): Promise<void>;

  /**
   * Abort any in-flight prompt. No-op if no prompt is active.
   */
  abort(): void;

  /**
   * Dispose the runner and release underlying resources.
   * Idempotent — safe to call multiple times.
   */
  dispose(): Promise<void>;

  /**
   * Hot-reload extensions/skills without restarting the process.
   * Calls loader.reload() on the underlying DefaultResourceLoader.
   */
  reload(): Promise<void>;

  /**
   * Returns the current pi session file path (if file-based sessions are in use).
   * Returns undefined for in-memory sessions or before the first prompt.
   */
  getSessionPath?(): string | undefined;
}

// ─── AgentRunnerFactory ──────────────────────────────────────────────────────

export interface ContextConfig {
  /** Unique context identifier (e.g., "main") */
  id: string;
  /** Workspace directory for this context (cwd for pi session) */
  workspacePath: string;
  /**
   * Optional: directory where pi session files are persisted for this context.
   * When provided, sessions are saved to disk instead of in-memory, enabling
   * session continuity across restarts.
   */
  sessionsDir?: string;
  /**
   * Optional: path to a specific session file to resume.
   * When provided, the agent loads this session rather than starting fresh.
   * Derived from getResumedSessionPath() on startup.
   */
  sessionPath?: string;
}

export interface AgentRunnerFactory {
  create(context: ContextConfig, config: import('../config.js').Config): AgentRunner;
}
