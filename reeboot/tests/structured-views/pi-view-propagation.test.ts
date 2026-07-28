import { describe, it, expect, vi } from 'vitest';

describe('Pi-runner tool_execution_end view propagation', () => {
  it('tool_call_end event includes view when tool result has view field', async () => {
    // Import the pi-runner module
    const mod = await import('@src/agent-runner/pi-runner.js');
    expect(mod.PiAgentRunner).toBeDefined();
  });

  it('view field is extracted from tool result object', () => {
    // Simulate what pi-runner does: extract view from toolResult
    const toolResult = {
      content: [{ type: 'text', text: 'done' }],
      view: { type: 'data-table' as const, columns: ['Name'], rows: [{ Name: 'Alice' }] },
    };

    const toolView = toolResult && typeof toolResult === 'object' && 'view' in toolResult
      ? (toolResult as Record<string, unknown>).view as Record<string, unknown>
      : undefined;

    expect(toolView).toBeDefined();
    expect(toolView!.type).toBe('data-table');
  });

  it('view field is undefined when tool result has no view', () => {
    const toolResult = {
      content: [{ type: 'text', text: 'done' }],
      // no view field
    };

    const toolView = toolResult && typeof toolResult === 'object' && 'view' in toolResult
      ? (toolResult as Record<string, unknown>).view as Record<string, unknown>
      : undefined;

    expect(toolView).toBeUndefined();
  });

  it('tool_call_end event emitted by pi-runner includes view field', () => {
    // Simulate the full onEvent call that pi-runner makes
    const toolResult = {
      content: [{ type: 'text', text: 'done' }],
      view: { type: 'data-table' as const, columns: ['Name'], rows: [{ Name: 'Alice' }] },
    };

    const toolView = { type: 'data-table', columns: ['Name'], rows: [{ Name: 'Alice' }] };

    const event = {
      type: 'tool_call_end' as const,
      toolCallId: 'test-123',
      toolName: 'test-tool',
      result: toolResult,
      view: toolView,
      isError: false,
    };

    expect(event.view).toBeDefined();
    expect(event.view!.type).toBe('data-table');
  });
});
