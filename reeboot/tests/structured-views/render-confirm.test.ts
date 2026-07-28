import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI } from '@src/extensions/extension-api.js';

describe('render_confirm tool', () => {
  it('returns confirm view with title and message', async () => {
    const { default: renderConfirmExtension } = await import('@src/extensions/render-confirm.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderConfirmExtension(mockApi);

    expect(registeredTool).not.toBeNull();
    expect(registeredTool.name).toBe('render_confirm');

    const result = await registeredTool.execute(
      'test-id',
      { title: 'Cancel order?', message: 'Are you sure?', confirmLabel: 'Yes', cancelLabel: 'No' },
      undefined, undefined, {}
    );

    expect(result.content).toBeDefined();
    expect(typeof result.content).toBe('string');
    expect(result.view).toBeDefined();
    expect(result.view.type).toBe('confirm');
    expect(result.view.title).toBe('Cancel order?');
    expect(result.view.message).toBe('Are you sure?');
  });

  it('passes through optional confirmLabel and cancelLabel', async () => {
    const { default: renderConfirmExtension } = await import('@src/extensions/render-confirm.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderConfirmExtension(mockApi);

    const result = await registeredTool.execute(
      'test-id',
      { title: 'Proceed?', message: 'Continue?', confirmLabel: 'Go', cancelLabel: 'Stop' },
      undefined, undefined, {}
    );

    expect(result.view.confirmLabel).toBe('Go');
    expect(result.view.cancelLabel).toBe('Stop');
  });

  it('returns isError for missing title', async () => {
    const { default: renderConfirmExtension } = await import('@src/extensions/render-confirm.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    renderConfirmExtension(mockApi);

    const result = await registeredTool.execute(
      'test-id',
      { message: 'test' },
      undefined, undefined, {}
    );

    expect(result.isError).toBe(true);
  });
});
