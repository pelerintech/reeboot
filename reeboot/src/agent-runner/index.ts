import type { Config } from '../config.js';
import type { AgentRunner, ContextConfig } from './interface.js';
import { PiAgentRunner } from './pi-runner.js';
import { DefaultResourceLoader } from '@mariozechner/pi-coding-agent';
import { homedir } from 'os';
import { join } from 'path';

export type { AgentRunner, AgentRunnerFactory, ContextConfig, RunnerEvent } from './interface.js';

/**
 * Factory function: reads config.agent.runner and returns the appropriate AgentRunner.
 * Phase 1 only supports "pi". Unknown values throw a descriptive error.
 */
export function createRunner(context: ContextConfig, config: Config): AgentRunner {
  const runnerType = (config.agent as any).runner ?? 'pi';

  if (runnerType === 'pi') {
    const agentDir = join(homedir(), '.reeboot');
    const loader = new DefaultResourceLoader({
      cwd: context.workspacePath,
      agentDir,
    });
    return new PiAgentRunner(context, loader);
  }

  throw new Error(`Unknown agent runner: ${runnerType}`);
}
