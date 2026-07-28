import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI } from '@src/extensions/extension-api.js';

describe('E2E: render_chart tool integration', () => {
  it('tool is registerable and produces correctly structured chart view', async () => {
    // Step 1: Register the tool via the extension
    const { default: renderChartExtension } = await import('@src/extensions/render-chart.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderChartExtension(mockApi);

    // Step 2: Verify the tool is registered with correct metadata
    expect(registeredTool).not.toBeNull();
    expect(registeredTool.name).toBe('render_chart');
    expect(typeof registeredTool.description).toBe('string');
    expect(registeredTool.description.length).toBeGreaterThan(0);

    // Step 3: Execute with valid input
    const result = await registeredTool.execute(
      'e2e-test-id',
      { labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [100, 200, 150, 300], kind: 'bar' },
      undefined, undefined, {}
    );

    // Step 4: Verify the output structure
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(typeof result.content).toBe('string');
    expect(result.content.length).toBeGreaterThan(0);

    expect(result.view).toBeDefined();
    expect(result.view.type).toBe('data-chart');
    expect(result.view.labels).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(result.view.values).toEqual([100, 200, 150, 300]);
    expect(result.view.kind).toBe('bar');

    // Step 5: Verify error handling
    const errorResult = await registeredTool.execute(
      'e2e-error',
      { labels: [], values: [], kind: 'bar' },
      undefined, undefined, {}
    );
    expect(errorResult.isError).toBe(true);
  });
});
