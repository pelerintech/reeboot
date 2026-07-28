import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI } from '@src/extensions/extension-api.js';

describe('render_plan tool', () => {
  it('returns plan view with diagram block', async () => {
    const { default: renderPlanExtension } = await import('@src/extensions/render-plan.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderPlanExtension(mockApi);

    expect(registeredTool).not.toBeNull();
    expect(registeredTool.name).toBe('render_plan');

    const result = await registeredTool.execute(
      'test-id',
      {
        blocks: [
          {
            type: 'diagram',
            title: 'Flow',
            nodes: [{ id: 'a', label: 'Start' }, { id: 'b', label: 'End' }],
            edges: [{ from: 'a', to: 'b' }],
          },
        ],
      },
      undefined, undefined, {}
    );

    expect(result.content).toBeDefined();
    expect(typeof result.content).toBe('string');
    expect(result.view).toBeDefined();
    expect(result.view.type).toBe('plan');
    expect(result.view.blocks).toHaveLength(1);
    expect(result.view.blocks[0].type).toBe('diagram');
    expect(result.view.blocks[0].title).toBe('Flow');
  });

  it('passes through multiple block types', async () => {
    const { default: renderPlanExtension } = await import('@src/extensions/render-plan.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderPlanExtension(mockApi);

    const result = await registeredTool.execute(
      'test-id',
      {
        blocks: [
          { type: 'decision', title: 'Pick', options: ['A', 'B'], chosen: 'A', rationale: 'Best' },
          { type: 'annotated-code', file: 'test.ts', language: 'typescript', annotations: [] },
        ],
      },
      undefined, undefined, {}
    );

    expect(result.view.blocks).toHaveLength(2);
    expect(result.view.blocks[0].type).toBe('decision');
    expect(result.view.blocks[1].type).toBe('annotated-code');
  });

  it('returns isError for empty blocks', async () => {
    const { default: renderPlanExtension } = await import('@src/extensions/render-plan.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderPlanExtension(mockApi);

    const result = await registeredTool.execute(
      'test-id',
      { blocks: [] },
      undefined, undefined, {}
    );

    expect(result.isError).toBe(true);
  });
});
