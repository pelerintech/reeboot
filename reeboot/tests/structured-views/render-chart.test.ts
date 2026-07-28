import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI } from '@src/extensions/extension-api.js';

describe('render_chart tool', () => {
  it('returns data-chart view with bar chart', async () => {
    const { default: renderChartExtension } = await import('@src/extensions/render-chart.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderChartExtension(mockApi);

    expect(registeredTool).not.toBeNull();
    expect(registeredTool.name).toBe('render_chart');

    const result = await registeredTool.execute(
      'test-id',
      { labels: ['Jan', 'Feb'], values: [10, 20], kind: 'bar' },
      undefined, undefined, {}
    );

    expect(result.content).toBeDefined();
    expect(typeof result.content).toBe('string');
    expect(result.view).toBeDefined();
    expect(result.view.type).toBe('data-chart');
    expect(result.view.labels).toEqual(['Jan', 'Feb']);
    expect(result.view.values).toEqual([10, 20]);
    expect(result.view.kind).toBe('bar');
  });

  it('returns data-chart view with line chart', async () => {
    const { default: renderChartExtension } = await import('@src/extensions/render-chart.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderChartExtension(mockApi);

    const result = await registeredTool.execute(
      'test-id',
      { labels: ['A'], values: [5], kind: 'line' },
      undefined, undefined, {}
    );

    expect(result.view.kind).toBe('line');
  });

  it('returns isError for empty labels', async () => {
    const { default: renderChartExtension } = await import('@src/extensions/render-chart.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderChartExtension(mockApi);

    const result = await registeredTool.execute(
      'test-id',
      { labels: [], values: [], kind: 'bar' },
      undefined, undefined, {}
    );

    expect(result.isError).toBe(true);
  });

  it('returns isError for mismatched lengths', async () => {
    const { default: renderChartExtension } = await import('@src/extensions/render-chart.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderChartExtension(mockApi);

    const result = await registeredTool.execute(
      'test-id',
      { labels: ['A', 'B'], values: [1], kind: 'bar' },
      undefined, undefined, {}
    );

    expect(result.isError).toBe(true);
  });
});
