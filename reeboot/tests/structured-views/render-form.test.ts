import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI } from '@src/extensions/extension-api.js';

describe('render_form tool', () => {
  it('returns form view with fields', async () => {
    const { default: renderFormExtension } = await import('@src/extensions/render-form.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderFormExtension(mockApi);

    expect(registeredTool).not.toBeNull();
    expect(registeredTool.name).toBe('render_form');

    const result = await registeredTool.execute(
      'test-id',
      { fields: [{ name: 'n', label: 'Name', type: 'text' }] },
      undefined, undefined, {}
    );

    expect(result.content).toBeDefined();
    expect(typeof result.content).toBe('string');
    expect(result.view).toBeDefined();
    expect(result.view.type).toBe('form');
    expect(result.view.fields).toHaveLength(1);
    expect(result.view.fields[0].name).toBe('n');
    expect(result.view.fields[0].label).toBe('Name');
    expect(result.view.fields[0].type).toBe('text');
  });

  it('passes through multiple field types (text, select, number)', async () => {
    const { default: renderFormExtension } = await import('@src/extensions/render-form.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderFormExtension(mockApi);

    const result = await registeredTool.execute(
      'test-id',
      {
        fields: [
          { name: 'name', label: 'Name', type: 'text' },
          { name: 'size', label: 'Size', type: 'select', options: ['S', 'M', 'L'] },
          { name: 'count', label: 'Count', type: 'number' },
        ],
      },
      undefined, undefined, {}
    );

    expect(result.view.fields).toHaveLength(3);
    expect(result.view.fields[0].type).toBe('text');
    expect(result.view.fields[1].type).toBe('select');
    expect(result.view.fields[2].type).toBe('number');
  });

  it('returns isError for empty fields', async () => {
    const { default: renderFormExtension } = await import('@src/extensions/render-form.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderFormExtension(mockApi);

    const result = await registeredTool.execute(
      'test-id',
      { fields: [] },
      undefined, undefined, {}
    );

    expect(result.isError).toBe(true);
  });

  it('returns isError for unknown field type', async () => {
    const { default: renderFormExtension } = await import('@src/extensions/render-form.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderFormExtension(mockApi);

    const result = await registeredTool.execute(
      'test-id',
      { fields: [{ name: 'x', label: 'X', type: 'checkbox' }] },
      undefined, undefined, {}
    );

    expect(result.isError).toBe(true);
  });
});
