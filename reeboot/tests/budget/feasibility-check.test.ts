/**
 * G8: Feasibility check guidance in set_budget
 *
 * The brief requires: "agent briefly reasons about whether the budget is
 * realistic for the task. If clearly insufficient, it warns the owner
 * before starting and offers to proceed or abort."
 *
 * Since agent reasoning happens at the LLM level, the implementation
 * injects this behaviour via:
 * 1. The tool description — instructs the agent to assess feasibility
 * 2. The return message — includes a feasibility prompt after confirming
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeMockPi(
  handlers: Record<string, Function[]> = {},
  tools: Record<string, { description: string; handler: Function }> = {}
) {
  return {
    on(event: string, handler: Function) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    tool(name: string, description: string, _schema: any, handler: Function) {
      tools[name] = { description, handler };
    },
    handlers,
    tools,
  };
}

describe('set_budget feasibility check', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'feasibility-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('set_budget tool description instructs agent to assess feasibility', async () => {
    const tools: Record<string, { description: string; handler: Function }> = {};
    const pi = makeMockPi({}, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    expect(tools['set_budget']).toBeDefined();
    const desc = tools['set_budget'].description;

    // Description must instruct the agent to assess feasibility
    expect(desc.toLowerCase()).toMatch(/feasib/);
  });

  it('set_budget return value includes feasibility reminder', async () => {
    const tools: Record<string, { description: string; handler: Function }> = {};
    const pi = makeMockPi({}, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    // Call with a small USD budget
    const result = await tools['set_budget'].handler({ amount: 0.30, unit: 'usd' });
    expect(result).toMatch(/\$0\.30/);
    // Must include a feasibility note
    expect(result.toLowerCase()).toMatch(/feasib|sufficient|realistic|whether/);
  });

  it('set_budget return value includes feasibility reminder for token budgets', async () => {
    const tools: Record<string, { description: string; handler: Function }> = {};
    const pi = makeMockPi({}, tools);

    const { makeBudgetManagerExtension } = await import('@src/extensions/budget-manager.js');
    makeBudgetManagerExtension(pi as any, { workspacePath: tmpDir, config: {} });

    const result = await tools['set_budget'].handler({ amount: 50000, unit: 'tokens' });
    expect(result).toMatch(/50k tokens/i);
    expect(result.toLowerCase()).toMatch(/feasib|sufficient|realistic|whether/);
  });
});
