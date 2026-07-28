/**
 * Delegate tool extension — SDK-agnostic sub-agent delegation.
 *
 * Registers a `delegate` tool that lets the main agent delegate sub-tasks
 * to sub-agents running in the same process (or to remote A2A peers).
 *
 * The delegate tool does not know about pi or ree directly. It uses the
 * `AgentRunner` interface for same-process sub-agents and an HTTP client
 * for A2A peers.
 *
 * ## Production wiring
 *
 * The `runnerFactory` can be set globally via `setDefaultRunnerFactory()` so the
 * server can register its runner factory at startup. A2A peers are resolved from
 * the runtime config (`ctx.config.a2a.peers`) at execution time, and the A2A
 * HTTP client is imported lazily, so no pre-registration is needed.
 */

import type { ExtensionAPI } from './extension-api.js';
import type { AgentRunner } from '../agent-runner/interface.js';
import { Type } from 'typebox';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DelegateOptions {
  /** Factory for creating sub-agent runners */
  runnerFactory?: (task: string) => AgentRunner;
  /** HTTP client for A2A peer delegation */
  a2aClient?: {
    invoke: (url: string, task: string, apiKey?: string) => Promise<string>;
  };
  /** Configured A2A peers (name → { url, apiKey }) */
  a2aPeers?: Record<string, { url: string; apiKey?: string }>;
}

// ─── Default runner factory (set by server at startup) ────────────────────────

let _defaultRunnerFactory: ((task: string) => AgentRunner) | undefined;

/**
 * Set the default runner factory used by the delegate tool when no factory
 * is passed via `DelegateOptions`. Called by `server.ts` at startup with
 * a factory that creates PiAgentRunner or ReeAgentRunner matching the config.
 */
export function setDefaultRunnerFactory(factory: (task: string) => AgentRunner): void {
  _defaultRunnerFactory = factory;
}

/**
 * Get the globally registered runner factory, if any.
 */
export function getDefaultRunnerFactory(): ((task: string) => AgentRunner) | undefined {
  return _defaultRunnerFactory;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve A2A peers from the runtime ExtensionContext config.
 */
function resolveA2APeersFromConfig(ctxConfig: Record<string, any>): Record<string, { url: string; apiKey?: string }> {
  const a2aConfig = ctxConfig?.a2a as Record<string, any> | undefined;
  const peers = Array.isArray(a2aConfig?.peers) ? a2aConfig.peers : [];
  const result: Record<string, { url: string; apiKey?: string }> = {};
  for (const p of peers) {
    if (p && typeof p.name === 'string' && typeof p.url === 'string') {
      result[p.name] = { url: p.url, apiKey: p.apiKey };
    }
  }
  return result;
}

/**
 * Lazy-import the A2A client module to avoid circular dependencies.
 */
async function lazyA2AInvoke(url: string, task: string, apiKey?: string): Promise<string> {
  const { a2aInvoke } = await import('./a2a-client.js');
  return a2aInvoke(url, task, apiKey);
}

// ─── Extension ────────────────────────────────────────────────────────────────

export function delegateExtension(pi: ExtensionAPI, opts: DelegateOptions = {}): void {
  pi.registerTool({
    name: 'delegate',
    label: 'Delegate',
    description:
      'Delegate a sub-task to a sub-agent. Creates a sub-agent session in the same process ' +
      'that runs the task and returns the result. If "peer" is specified, delegates to a ' +
      'configured remote A2A peer agent instead.',

    parameters: Type.Object({
      task: Type.String({
        description: 'The task to delegate. Describe clearly what the sub-agent should do.',
      }),
      peer: Type.Optional(Type.String({
        description: 'Optional A2A peer name (configured in config.json a2a.peers). ' +
          'If not set, creates a same-process sub-agent.',
      })),
      timeout: Type.Optional(Type.Number({
        description: 'Timeout in seconds for the sub-agent (default: 60).',
      })),
    }),

    async execute(_id: string, params: any, _signal: any, _onUpdate: any, _ctx: any) {
      const task = (params.task as string) ?? '';
      const peer = params.peer as string | undefined;
      const timeoutMs = ((params.timeout as number) ?? 60) * 1000;
      const ctx = _ctx as Record<string, any> | undefined;

      if (!task.trim()) {
        return {
          content: [{ type: 'text' as const, text: 'Error: task is required.' }],
          details: {},
          isError: true,
        };
      }

      // Route to A2A peer if specified
      if (peer) {
        // Resolve peers from: explicit opts → ctx.config → empty
        const a2aPeers = opts.a2aPeers ?? (ctx?.config ? resolveA2APeersFromConfig(ctx.config) : {});
        const peerConfig = a2aPeers[peer];

        if (!peerConfig) {
          return {
            content: [{ type: 'text' as const, text: `Unknown A2A peer: "${peer}". Configured peers: ${Object.keys(a2aPeers).join(', ') || '(none)'}` }],
            details: {},
            isError: true,
          };
        }

        try {
          // Use explicit client if provided, otherwise lazy-import the module
          let result: string;
          if (opts.a2aClient) {
            result = await opts.a2aClient.invoke(peerConfig.url, task, peerConfig.apiKey);
          } else {
            result = await lazyA2AInvoke(peerConfig.url, task, peerConfig.apiKey);
          }
          return {
            content: [{ type: 'text' as const, text: result }],
            details: {},
            view: result
              ? { type: 'data-table' as const, columns: ['Task', 'Result'], rows: [{ Task: task, Result: result }] }
              : undefined,
          };
        } catch (err: any) {
          return {
            content: [{ type: 'text' as const, text: `A2A delegation to "${peer}" failed: ${err?.message ?? String(err)}` }],
            details: {},
            isError: true,
          };
        }
      }

      // Same-process sub-agent: resolve factory from opts → default → error
      const factory = opts.runnerFactory ?? _defaultRunnerFactory;
      if (!factory) {
        return {
          content: [{ type: 'text' as const, text: 'Sub-agent runner is not available. Cannot create sub-agent.' }],
          details: {},
          isError: true,
        };
      }

      // Create and run the sub-agent with timeout
      try {
        const runner = factory(task);
        const events: string[] = [];

        const resultPromise = new Promise<string>((resolve, reject) => {
          runner.prompt(task, (event) => {
            if (event.type === 'text_delta') {
              events.push(event.delta);
            } else if (event.type === 'message_end') {
              resolve(events.join(''));
            } else if (event.type === 'error') {
              reject(new Error(event.message));
            }
          }).catch(reject);
        });

        // Race against timeout
        const timeoutResult = await Promise.race([
          resultPromise,
          new Promise<never>((_, reject) => {
            const timer = setTimeout(() => {
              runner.abort();
              reject(new Error(`Sub-agent timed out after ${timeoutMs / 1000}s`));
            }, timeoutMs);
            // Allow preemptive abort via signal
            if (runner.abort) {
              const origAbort = runner.abort.bind(runner);
              runner.abort = () => {
                clearTimeout(timer);
                origAbort();
              };
            }
          }),
        ]);

        return {
          content: [{ type: 'text' as const, text: timeoutResult }],
          details: {},
          view: timeoutResult
            ? { type: 'data-table' as const, columns: ['Task', 'Result'], rows: [{ Task: task, Result: timeoutResult }] }
            : undefined,
        };
      } catch (err: any) {
        const message = err?.message ?? String(err);
        return {
          content: [{ type: 'text' as const, text: message }],
          details: {},
          isError: true,
        };
      }
    },
  });
}

export default delegateExtension;
