/**
 * scheduler-snippets.test.ts
 *
 * Verifies that all scheduler extension tools carry promptSnippet fields
 * so they appear in the system prompt's "Available tools" section.
 */

import { describe, it, expect } from 'vitest';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

const EXPECTED_TOOLS = [
  'timer',
  'heartbeat',
  'schedule_task',
  'list_tasks',
  'cancel_task',
  'pause_task',
  'resume_task',
  'update_task',
];

async function collectSchedulerTools(): Promise<Map<string, ToolDefinition>> {
  const tools = new Map<string, ToolDefinition>();

  const mockPi = {
    registerTool: (def: ToolDefinition) => { tools.set(def.name, def); },
    on: () => {},
    registerCommand: () => {},
    registerShortcut: () => {},
    registerFlag: () => {},
  } as any;

  const mod = await import('../src/extensions/scheduler-tool.ts');
  const config = {} as any;
  await mod.default(mockPi, config);

  return tools;
}

describe('scheduler-tool extension — promptSnippet', () => {
  for (const toolName of EXPECTED_TOOLS) {
    it(`${toolName} has a non-empty promptSnippet`, async () => {
      const tools = await collectSchedulerTools();
      const tool = tools.get(toolName);
      expect(tool, `${toolName} tool not registered`).toBeDefined();
      expect(typeof tool!.promptSnippet).toBe('string');
      expect(tool!.promptSnippet!.trim().length).toBeGreaterThan(0);
    });
  }
});
