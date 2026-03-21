import type { Config } from '../config.js';
import type { AgentRunner, ContextConfig } from './interface.js';
import { PiAgentRunner } from './pi-runner.js';
import { createLoader } from '../extensions/loader.js';

export type { AgentRunner, AgentRunnerFactory, ContextConfig, RunnerEvent } from './interface.js';

/**
 * Factory function: reads config.agent.runner and returns the appropriate AgentRunner.
 * Phase 1 only supports "pi". Unknown values throw a descriptive error.
 */
export function createRunner(context: ContextConfig, config: Config): AgentRunner {
  const runnerType = (config.agent as any).runner ?? 'pi';

  if (runnerType === 'pi') {
    const loader = createLoader(context, config);
    return new PiAgentRunner(context, loader, config);
  }

  throw new Error(`Unknown agent runner: ${runnerType}`);
}
