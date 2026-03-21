/**
 * initAgentDir
 *
 * Ensures ~/.reeboot/agent/ exists with the reeboot persona AGENTS.md.
 * This is the pi agentDir for reeboot — pi reads AGENTS.md from here as
 * the global system prompt for the agent.
 *
 * Does NOT overwrite an existing AGENTS.md (user may have customised it).
 */

import { mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function initAgentDir(reebotDir: string): Promise<void> {
  const agentDir = join(reebotDir, 'agent');
  mkdirSync(agentDir, { recursive: true });

  const agentsPath = join(agentDir, 'AGENTS.md');
  if (!existsSync(agentsPath)) {
    // Resolve template relative to this file: dist/utils/ → dist/ → package root → templates/
    const templatePath = join(__dirname, '..', '..', 'templates', 'main-agents.md');
    if (existsSync(templatePath)) {
      copyFileSync(templatePath, agentsPath);
    }
  }
}
