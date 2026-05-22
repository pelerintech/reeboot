/**
 * Capabilities Discovery Extension
 *
 * Discovers all registered tools (excluding pi built-ins) and injects a
 * structured capabilities block into the system prompt on every session start.
 *
 * Two-tier capping:
 *   - Bundled (reeboot internal) tools: NEVER capped — always advertised
 *   - External/user-defined tools: capped at config.capabilities.externalToolCap (default 50)
 *
 * Hooks:
 *   - before_agent_start — discovers tools, builds block, appends to system prompt
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { emitEvent } from '../observability/events.js';
import { getDb } from '../db/index.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_EXTERNAL_CAP = 50;

// Heuristic: pi built-in tools come from the pi-coding-agent package core tools directory
const BUILT_IN_TOOL_PATH_PATTERN = /pi-coding-agent.*[/\\]core[/\\]tools[/\\]/;

// Heuristic: bundled reeboot tools come from our own dist/extensions/ path
const BUNDLED_TOOL_PATH_PATTERN = /reeboot.*[/\\](dist|src)[/\\]extensions[/\\]/;

// ─── Tool filtering ───────────────────────────────────────────────────────────

export interface ToolInfo {
  name: string;
  description: string;
  parameters: unknown;
  sourceInfo: { path: string };
}

/**
 * Returns true if the tool is a pi built-in (bash, read, edit, etc.)
 * that already appears in pi's default "Available tools" section.
 */
export function isBuiltInTool(tool: ToolInfo): boolean {
  if (!tool.sourceInfo?.path) return false;
  return BUILT_IN_TOOL_PATH_PATTERN.test(tool.sourceInfo.path);
}

/**
 * Returns true if the tool is a bundled reeboot internal tool.
 * These are never capped — correctness over token cost.
 */
export function isBundledTool(tool: ToolInfo): boolean {
  if (!tool.sourceInfo?.path) return false;
  return BUNDLED_TOOL_PATH_PATTERN.test(tool.sourceInfo.path);
}

// ─── Block builder ────────────────────────────────────────────────────────────

function renderToolLine(tool: ToolInfo): string {
  return (
    `• ${tool.name} — ${tool.description}.\n` +
    `  Use \`${tool.name}\` when this capability matches the user's need.\n`
  );
}

/**
 * Builds a structured capabilities block from bundled and external tools.
 * Bundled tools are always shown. External tools are capped.
 */
export function buildCapabilitiesBlock(
  bundledTools: ToolInfo[],
  externalTools: ToolInfo[],
  externalCap: number
): string {
  const total = bundledTools.length + externalTools.length;

  if (total === 0) {
    return (
      '\n══════════════════════════════════════════════════════════════════\n' +
      'ADDITIONAL CAPABILITIES\n' +
      '══════════════════════════════════════════════════════════════════\n' +
      'No additional tools registered.\n'
    );
  }

  const cappedExternal = externalTools.slice(0, externalCap);
  const remainingExternal = externalTools.length - cappedExternal.length;

  let block =
    '\n══════════════════════════════════════════════════════════════════\n' +
    'ADDITIONAL CAPABILITIES\n' +
    '══════════════════════════════════════════════════════════════════\n' +
    'The following tools are available in addition to the built-in set. ' +
    "Use them proactively when they match the user's need.\n\n";

  for (const tool of bundledTools) {
    block += renderToolLine(tool);
  }

  for (const tool of cappedExternal) {
    block += renderToolLine(tool);
  }

  if (remainingExternal > 0) {
    block += `\n… and ${remainingExternal} more external tool(s) not shown.\n`;
  }

  block += '\n';
  return block;
}

// ─── Extension factory ────────────────────────────────────────────────────────

/**
 * Core extension factory.
 */
export function makeCapabilitiesExtension(
  pi: ExtensionAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any = {}
): void {
  const externalCap =
    config.capabilities?.externalToolCap ?? DEFAULT_EXTERNAL_CAP;

  pi.on('before_agent_start', async (event: any) => {
    const allTools = pi.getAllTools() as ToolInfo[];
    const customTools = allTools.filter((t) => !isBuiltInTool(t));

    const bundledTools = customTools.filter((t) => isBundledTool(t));
    const externalTools = customTools.filter((t) => !isBundledTool(t));

    const block = buildCapabilitiesBlock(bundledTools, externalTools, externalCap);

    const advertisedExternal = externalTools.slice(0, externalCap);
    const advertisedTools = [...bundledTools, ...advertisedExternal];

    // Emit observability event (graceful degradation if DB not ready)
    try {
      const db = getDb();
      if (db) {
        await emitEvent(db, {
          type: 'capabilities_injected',
          severity: 9, // INFO
          payload: {
            toolCount: advertisedTools.length,
            toolNames: advertisedTools.map((t) => t.name),
            sourceBreakdown: {
              bundled: bundledTools.length,
              user: advertisedExternal.filter((t) =>
                t.sourceInfo?.path?.includes('/agent/')
              ).length,
              mcp: advertisedExternal.filter((t) =>
                t.sourceInfo?.path?.includes('mcp')
              ).length,
              skill: advertisedExternal.filter((t) =>
                t.sourceInfo?.path?.includes('skill')
              ).length,
            },
          },
        });
      }
    } catch {
      // DB or observability not ready — skip silently
    }

    return {
      systemPrompt: (event.systemPrompt ?? '') + block,
    };
  });
}

// ─── Default export ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function capabilitiesExtension(pi: ExtensionAPI, config?: any): void {
  makeCapabilitiesExtension(pi, config ?? {});
}
