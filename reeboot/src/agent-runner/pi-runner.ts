/**
 * PiAgentRunner — wraps the pi SDK AgentSession.
 *
 * Pi SDK event mapping (verified against @mariozechner/pi-agent-core types.d.ts):
 *
 *   pi event                    → RunnerEvent
 *   ─────────────────────────────────────────────────────────────────────
 *   message_update              → text_delta
 *     .assistantMessageEvent.type === "text_delta"
 *     .assistantMessageEvent.delta  (the text string)
 *
 *   tool_execution_start        → tool_call_start
 *     .toolCallId, .toolName, .args
 *
 *   tool_execution_end          → tool_call_end
 *     .toolCallId, .toolName, .result, .isError
 *
 *   agent_end                   → message_end
 *     (usage is retrieved from session stats — pi does not put it on agent_end directly)
 *
 * All other pi events are silently ignored.
 *
 * agentDir:  ~/.reeboot/   (global extensions/skills)
 * cwd:       context.workspacePath  (project-local discovery)
 */

import { nanoid } from 'nanoid';
import type { AgentRunner, ContextConfig, RunnerEvent } from './interface.js';
import type { ResourceLoader } from '@mariozechner/pi-coding-agent';

export class PiAgentRunner implements AgentRunner {
  private readonly context: ContextConfig;
  private readonly loader: ResourceLoader;
  private abortController: AbortController | null = null;
  private disposed = false;

  // Lazily created on first prompt
  private _session: import('@mariozechner/pi-coding-agent').AgentSession | null = null;

  constructor(context: ContextConfig, loader: ResourceLoader) {
    this.context = context;
    this.loader = loader;
  }

  // ── prompt ─────────────────────────────────────────────────────────────────

  async prompt(content: string, onEvent: (event: RunnerEvent) => void): Promise<void> {
    if (this.disposed) {
      throw new Error('PiAgentRunner has been disposed');
    }

    const session = await this._getOrCreateSession();
    const runId = nanoid();
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    return new Promise<void>((resolve, reject) => {
      // Subscribe before prompting so we don't miss early events
      const unsubscribe = session.subscribe((event) => {
        if (signal.aborted) return;

        if (event.type === 'message_update') {
          const ae = event.assistantMessageEvent;
          if (ae.type === 'text_delta') {
            onEvent({ type: 'text_delta', delta: ae.delta });
          }
        } else if (event.type === 'tool_execution_start') {
          onEvent({
            type: 'tool_call_start',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
          });
        } else if (event.type === 'tool_execution_end') {
          onEvent({
            type: 'tool_call_end',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            result: event.result,
            isError: event.isError,
          });
        } else if (event.type === 'agent_end') {
          // Extract usage from the last assistant message if available
          let inputTokens = 0;
          let outputTokens = 0;
          const messages = event.messages;
          // Look for the last assistant message to get token info
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i] as any;
            if (m.role === 'assistant' && m.usage) {
              inputTokens = m.usage.inputTokens ?? 0;
              outputTokens = m.usage.outputTokens ?? 0;
              break;
            }
          }
          onEvent({
            type: 'message_end',
            runId,
            usage: { input: inputTokens, output: outputTokens },
          });
          unsubscribe();
          this.abortController = null;
          resolve();
        }
      });

      // Abort handling
      signal.addEventListener('abort', () => {
        unsubscribe();
        this.abortController = null;
        reject(new DOMException('Prompt aborted', 'AbortError'));
      }, { once: true });

      // Fire the prompt
      session.prompt(content).catch((err) => {
        unsubscribe();
        this.abortController = null;
        if (signal.aborted) {
          reject(new DOMException('Prompt aborted', 'AbortError'));
        } else {
          onEvent({ type: 'error', message: String(err?.message ?? err) });
          reject(err);
        }
      });
    });
  }

  // ── abort ──────────────────────────────────────────────────────────────────

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    // Also abort the underlying session if it exists
    if (this._session) {
      try {
        this._session.abort();
      } catch {
        // ignore
      }
    }
  }

  // ── dispose ────────────────────────────────────────────────────────────────

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.abort();
    // No dispose() on AgentSession in pi SDK — it persists state on its own
    this._session = null;
  }

  // ── reload ─────────────────────────────────────────────────────────────────

  async reload(): Promise<void> {
    await this.loader.reload();
  }

  // ── internal ───────────────────────────────────────────────────────────────

  private async _getOrCreateSession(): Promise<import('@mariozechner/pi-coding-agent').AgentSession> {
    if (this._session) return this._session;

    const { createAgentSession, SessionManager } = await import('@mariozechner/pi-coding-agent');

    const { session } = await createAgentSession({
      cwd: this.context.workspacePath,
      resourceLoader: this.loader,
      sessionManager: SessionManager.inMemory(),
    });

    this._session = session;
    return session;
  }
}
