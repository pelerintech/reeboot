import type { Config } from '../config.js';
import type { AgentRunner, ContextConfig } from './interface.js';
import { PiAgentRunner } from './pi-runner.js';
import { ReeAgentRunner } from './ree-runner.js';
import { createLoader, getReeFactories } from '../extensions/loader.js';
import { ReeRuntime } from '../runtime/ree-runtime.js';

export type { AgentRunner, AgentRunnerFactory, ContextConfig, RunnerEvent } from './interface.js';

// Exported for ree session_search tool to access the history DB.
// Returns null if ree runtime hasn't been initialised yet.
export function getReeRuntime(): ReeRuntime | null {
  return _reeRuntime;
}

// Shared ReeRuntime singleton — one per process, shared across all ree runners
let _reeRuntime: ReeRuntime | null = null;

/**
 * Factory function: reads config.sdk (canonical) or config.agent.runner (alias)
 * and returns the appropriate AgentRunner.
 *
 * Resolution: config.sdk ?? config.agent.runner ?? 'pi'
 */
export function createRunner(context: ContextConfig, config: Config): AgentRunner {
  const sdk = config.sdk ?? config.agent?.runner ?? 'pi';

  if (sdk === 'pi') {
    const loader = createLoader(context, config);
    return new PiAgentRunner(context, loader, config);
  }

  if (sdk === 'ree') {
    // Create or reuse the shared ReeRuntime singleton
    if (!_reeRuntime) {
      const ree = config.ree ?? {};
      _reeRuntime = new ReeRuntime({
        config,
        maxChats: ree.maxChats,
        idleTtlMs: ree.idleTtlMs,
        maxHistoryPerChat: ree.maxHistoryPerChat,
      });
      _reeRuntime.setFactories(getReeFactories(config));
    }
    return new ReeAgentRunner(_reeRuntime, context, config);
  }

  throw new Error(`Unknown sdk: ${sdk}`);
}
