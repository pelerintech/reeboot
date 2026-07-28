import { describe, it, expect, vi } from 'vitest';
import type { ExtensionAPI } from '@src/extensions/extension-api.js';

describe('Delegate extension loader wiring', () => {
  it('delegate tool is registered when delegate extension is loaded', async () => {
    const { delegateExtension } = await import('@src/extensions/delegate.js');

    let registeredTool: any = null;
    const mockApi: ExtensionAPI = {
      registerTool: vi.fn((tool: any) => { registeredTool = tool; }),
      on: vi.fn(),
      getAllTools: vi.fn().mockReturnValue([]),
      getActiveTools: vi.fn().mockReturnValue([]),
    } as any;

    delegateExtension(mockApi, {});

    expect(registeredTool).not.toBeNull();
    expect(registeredTool.name).toBe('delegate');
  });

  it('delegate extension is exported from extensions directory', async () => {
    const mod = await import('@src/extensions/delegate.js');
    expect(mod.delegateExtension).toBeDefined();
    expect(typeof mod.delegateExtension).toBe('function');
  });
});
