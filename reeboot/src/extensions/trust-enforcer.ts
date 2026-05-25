/**
 * Trust Enforcer Extension
 *
 * Enforces tool whitelists for end-user trust sessions. Hooks `tool_call`
 * events and blocks disallowed tools when the current session trust is
 * `end-user`. Reads trust level from the workspace meta file written by
 * the orchestrator before each prompt.
 *
 * This replaces the non-functional _toolCallGuard approach in pi-runner.ts
 * that only worked in test mocks.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { getLogger } from '../observability/logger.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface MetaFile {
  operationType?: string;
  turnId?: string;
  trust?: string;
}

function readTrustFromMeta(cwd: string): string {
  const metaPath = join(cwd, '.reeboot_turn_meta.json');
  if (!existsSync(metaPath)) return 'owner';
  try {
    const raw = readFileSync(metaPath, 'utf-8');
    const meta: MetaFile = JSON.parse(raw);
    return meta.trust ?? 'owner';
  } catch {
    return 'owner';
  }
}

function getContextIdFromCwd(cwd: string): string {
  // cwd is ~/.reeboot/contexts/<contextId>/workspace
  // Walk up: workspace → contextId → contexts
  const parts = cwd.split('/');
  // The workspace dir's parent is the contextId dir
  if (parts.length >= 2 && parts[parts.length - 1] === 'workspace') {
    return parts[parts.length - 2];
  }
  return 'main';
}

// ─── Extension ───────────────────────────────────────────────────────────────

export function makeTrustEnforcerExtension(pi: ExtensionAPI, config: any): void {
  pi.on('tool_call', async (event, ctx) => {
    const trust = readTrustFromMeta(ctx.cwd);
    if (trust !== 'end-user') return undefined;

    const contextId = getContextIdFromCwd(ctx.cwd);
    const contextEntry = (config?.contexts ?? []).find(
      (c: any) => c.name === contextId,
    );
    const whitelist: string[] = contextEntry?.tools?.whitelist ?? [];

    // No whitelist configured — allow all tools
    if (whitelist.length === 0) return undefined;

    const toolName = event.toolName as string;
    if (whitelist.includes(toolName)) return undefined;

    // Violation logging
    const violationsLog = config?.permissions?.violations?.log ?? true;
    if (violationsLog) {
      getLogger().warn(
        {
          component: 'trust-enforcer',
          event: 'trust_violation',
          toolName,
          trust: 'end-user',
          contextId,
        },
        `Tool "${toolName}" blocked by trust-enforcer (end-user trust)`,
      );
    }

    return {
      block: true,
      reason: `Tool "${toolName}" is not available in this context`,
    };
  });
}

export default makeTrustEnforcerExtension;