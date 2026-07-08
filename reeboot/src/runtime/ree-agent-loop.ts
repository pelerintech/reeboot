/**
 * Ree Agent Loop — TanStack AI-backed agent loop.
 *
 * Consumes TanStack AI's `chat()` async iterable and translates AG-UI events
 * into BOTH RunnerEvents (for the orchestrator) AND reeboot-shaped extension
 * events (for the ReeExtensionAdapter).
 *
 * TanStack AI v0.39 API:
 * - `chat({ adapter, messages, systemPrompts, tools, mcp, abortController, agentLoopStrategy })`
 * - Returns AsyncIterable<StreamChunk> of AG-UI events
 * - Tools are auto-executed by TanStack when passed to chat()
 * - Tool execution context includes toolCallId, abortSignal, emitCustomEvent
 */

import { chat, toolDefinition, maxIterations } from '@tanstack/ai';
import type { ReeChat } from './ree-chat.js';
import type { RunnerEvent } from '../agent-runner/interface.js';
import type { ExtensionContext, ToolDefinition as ReeToolDefinition } from '../extensions/extension-api.js';
import type { ModelMessage } from '@tanstack/ai';
import type { ReeExtensionAdapter } from '../extensions/ree-adapter.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentLoopOptions {
  /** TanStack AI text adapter (e.g., openaiText('gpt-4o')) */
  adapter: unknown;
  /** System prompt text */
  systemPrompt?: string;
  /** Maximum agent loop iterations */
  maxIterations?: number;
  /** MCP clients (optional) */
  mcpClients?: unknown[];
}

// ─── Tool converter ──────────────────────────────────────────────────────────

/**
 * Convert a reeboot ToolDefinition to a TanStack AI server tool.
 *
 * TanStack's toolDefinition().server(execute) creates a ServerTool that
 * TanStack auto-executes during the chat loop.
 *
 * The execute function bridges TanStack's (args, context) signature to
 * reeboot's 5-param execute(toolCallId, params, signal, onUpdate, ctx).
 */
export function toTanStackTool(
  reeTool: ReeToolDefinition,
  ctx: ExtensionContext,
): ReturnType<typeof toolDefinition>['server'] extends (...args: infer P) => infer _ ? ReturnType<ReturnType<typeof toolDefinition>['server']> : never {
  return toolDefinition({
    name: reeTool.name,
    description: reeTool.description,
    inputSchema: reeTool.parameters as any,
  }).server(async (args: any, toolContext?: { toolCallId?: string; abortSignal?: AbortSignal; emitCustomEvent?: (name: string, value: Record<string, any>) => void }) => {
    // Bridge TanStack's (args, context) to reeboot's 5-param execute
    const toolCallId = toolContext?.toolCallId ?? 'unknown';
    const signal = toolContext?.abortSignal;
    const onUpdate = toolContext?.emitCustomEvent
      ? (details: unknown) => toolContext.emitCustomEvent!('tool_execution_update', { details })
      : undefined;

    const result = await reeTool.execute(toolCallId, args, signal, onUpdate, ctx);

    // TanStack expects the tool to return content directly
    return typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);
  });
}

// ─── History converter ───────────────────────────────────────────────────────

/**
 * Convert reeboot's message history to TanStack's ModelMessage format.
 */
function toTanStackMessages(history: Array<{ role: string; content: unknown }>): Array<{ role: string; content: string }> {
  return history.map((msg) => ({
    role: msg.role,
    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
  }));
}

// ─── Agent loop ──────────────────────────────────────────────────────────────

/**
 * Run the TanStack AI-backed agent loop.
 *
 * @param chat - The ReeChat instance (owns history, emitter, abortController)
 * @param content - The user's prompt text
 * @param onEvent - Callback for RunnerEvents (text_delta, tool_call_*, message_end, error)
 * @param options - Agent loop options (adapter, systemPrompt, maxIterations)
 * @returns The accumulated assistant response text
 */
export async function runReeAgentLoop(
  reeChat: ReeChat,
  content: string,
  onEvent: (event: RunnerEvent) => void,
  options: AgentLoopOptions,
): Promise<string> {
  const { adapter, systemPrompt, maxIterations: maxIter = 5, mcpClients } = options;

  // Build the user message
  const userMessage = {
    role: 'user' as const,
    content,
  };

  // Convert chat history + user message to TanStack format
  const messages: Array<{ role: string; content: string }> = [
    ...toTanStackMessages(reeChat.history),
    userMessage,
  ];

  // Convert reeboot tools to TanStack tools
  const reeAdapter = reeChat.adapter as unknown as ReeExtensionAdapter;
  const tanstackTools = Array.from(reeChat.tools.values()).map((tool) =>
    toTanStackTool(tool, reeAdapter.context),
  );

  // Build chat options
  const chatOptions: Record<string, unknown> = {
    adapter,
    messages,
    systemPrompts: systemPrompt ? [systemPrompt] : undefined,
    tools: tanstackTools.length > 0 ? tanstackTools : undefined,
    abortController: reeChat.abortController,
    agentLoopStrategy: maxIterations(maxIter),
    ...(mcpClients && mcpClients.length > 0
      ? { mcp: { clients: mcpClients, connection: 'keep-alive' } }
      : {}),
  };

  // Accumulators
  let accumulatedText = '';
  const toolCalls = new Map<string, { toolName: string; args: string }>();

  try {
    // Emit before_agent_start
    reeChat.emitBeforeAgentStart({
      prompt: content,
      systemPrompt: systemPrompt ?? '',
      systemPromptOptions: {},
    });

    const stream = (chat as any)(chatOptions) as AsyncIterable<any>;
    for await (const chunk of stream) {
      // Check for abort
      if (reeChat.abortController.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const type = (chunk as any).type;

      switch (type) {
        // ── Text message events ──────────────────────────────────────────

        case 'TEXT_MESSAGE_CONTENT': {
          const delta = (chunk as any).delta;
          accumulatedText += delta;
          onEvent({ type: 'text_delta', delta });
          break;
        }

        case 'TEXT_MESSAGE_START':
        case 'TEXT_MESSAGE_END':
          // No RunnerEvent — just tracking
          break;

        // ── Tool call events ─────────────────────────────────────────────

        case 'TOOL_CALL_START': {
          const toolCallId = (chunk as any).toolCallId;
          const toolName = (chunk as any).toolCallName;
          toolCalls.set(toolCallId, { toolName, args: '' });

          // Emit tool_call extension event
          reeChat.emitToolCall({
            toolCallId,
            toolName,
            args: {},
          });

          // Emit tool_call_start RunnerEvent
          onEvent({
            type: 'tool_call_start',
            toolCallId,
            toolName,
            args: {},
          });
          break;
        }

        case 'TOOL_CALL_ARGS': {
          const toolCallId = (chunk as any).toolCallId;
          const delta = (chunk as any).delta;
          const entry = toolCalls.get(toolCallId);
          if (entry) {
            entry.args += delta;
          }
          break;
        }

        case 'TOOL_CALL_END': {
          const toolCallId = (chunk as any).toolCallId;
          const entry = toolCalls.get(toolCallId);
          if (entry) {
            // Parse accumulated args JSON
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = entry.args ? JSON.parse(entry.args) : {};
            } catch {
              parsedArgs = { _raw: entry.args };
            }

            // Update the tool_call event with full args (TanStack executes
            // the tool internally, so we update our emitted event)
            reeChat.emitToolCall({
              toolCallId,
              toolName: entry.toolName,
              args: parsedArgs,
            });
          }
          break;
        }

        case 'TOOL_CALL_RESULT': {
          const toolCallId = (chunk as any).toolCallId;
          const toolContent = (chunk as any).content;
          const entry = toolCalls.get(toolCallId);

          // Parse args for the input field
          let parsedArgs: Record<string, unknown> = {};
          if (entry) {
            try {
              parsedArgs = entry.args ? JSON.parse(entry.args) : {};
            } catch {
              parsedArgs = { _raw: entry.args };
            }
          }

          // Emit tool_result extension event (with 'input' field — the gotcha)
          reeChat.emitToolResult({
            toolCallId,
            toolName: entry?.toolName ?? 'unknown',
            input: parsedArgs,
            content: [typeof toolContent === 'string' ? { type: 'text', text: toolContent } : toolContent],
            isError: false,
          });

          // Emit tool_call_end RunnerEvent
          onEvent({
            type: 'tool_call_end',
            toolCallId,
            toolName: entry?.toolName ?? 'unknown',
            result: toolContent,
            isError: false,
          });

          toolCalls.delete(toolCallId);
          break;
        }

        // ── Run lifecycle events ─────────────────────────────────────────

        case 'RUN_STARTED':
          // Already emitted before_agent_start above
          break;

        case 'RUN_FINISHED': {
          const runId = (chunk as any).runId;

          // Emit after_provider_response (best-effort from config)
          const provider = (reeAdapter.context.config as any)?.agent?.model?.provider ?? 'unknown';
          reeChat.emitAfterProviderResponse({
            contextId: reeChat.sessionId,
            provider,
            status: 200,
            headers: {},
          });

          // Emit turn_end
          reeChat.emitTurnEnd({
            turnId: `turn-${Date.now()}`,
            turnIndex: reeChat.history.length > 0 ? Math.floor(reeChat.history.length / 2) : 0,
            message: { role: 'assistant', content: accumulatedText },
            toolResults: [],
          });

          // Emit agent_end
          reeChat.emitAgentEnd({
            messages: [...reeChat.history, { role: 'user', content }, { role: 'assistant', content: accumulatedText }],
          });

          // Emit message_end RunnerEvent
          onEvent({
            type: 'message_end',
            runId: runId ?? `run-${Date.now()}`,
            usage: { input: 0, output: 0 },
          });
          break;
        }

        case 'RUN_ERROR': {
          const message = (chunk as any).message ?? 'Unknown error';
          onEvent({ type: 'error', message });
          break;
        }

        // ── Other events (step, reasoning, state, custom) ────────────────

        case 'STEP_STARTED':
        case 'STEP_FINISHED':
        case 'REASONING_START':
        case 'REASONING_END':
        case 'REASONING_MESSAGE_START':
        case 'REASONING_MESSAGE_CONTENT':
        case 'REASONING_MESSAGE_END':
        case 'STATE_SNAPSHOT':
        case 'STATE_DELTA':
        case 'MESSAGES_SNAPSHOT':
          // Ignore for now — can be added for observability later
          break;

        default:
          // Unknown event type — log and continue
          break;
      }
    }
  } catch (error: any) {
    if (error?.name === 'AbortError' || reeChat.abortController.signal.aborted) {
      throw error; // Re-throw abort errors
    }
    onEvent({ type: 'error', message: error?.message ?? 'Agent loop error' });
    throw error;
  }

  // If the stream ended but the chat was aborted (TanStack emits RUN_ERROR
  // instead of throwing on abort), throw an AbortError so the caller knows.
  if (reeChat.abortController.signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Append messages to chat history
  reeChat.appendMessage({ role: 'user', content });
  if (accumulatedText) {
    reeChat.appendMessage({ role: 'assistant', content: accumulatedText });
  }

  return accumulatedText;
}
