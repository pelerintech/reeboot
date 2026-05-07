import { describe, it, expect, vi } from 'vitest';

describe('budget-manager wired into getBundledFactories', () => {
  it('loader includes a budget-manager factory when factories are built', async () => {
    vi.resetModules();

    // Mock all the dynamic imports so loader doesn't actually import extensions
    vi.mock('@earendil-works/pi-coding-agent', async (importOriginal) => {
      const actual = await importOriginal() as any;
      return {
        ...actual,
        DefaultResourceLoader: class {
          constructor(_opts: any) {}
        },
      };
    });

    const { getBundledFactories } = await import('@src/extensions/loader.js');
    const { defaultConfig } = await import('@src/config.js');

    // Track which extension names the loader imports
    const importedExtensions: string[] = [];
    const origImport = (global as any).__vitest_worker__?.rpc;

    // We test this by checking factory count: budget-manager adds 1 factory (always-on)
    // Before the fix, factory count for a minimal config was N (without budget-manager)
    // After the fix it should be N+1

    // Simpler approach: verify budget-manager module is in the factory list by
    // checking it's invocable. We create a minimal mock pi and run all factories.
    const registeredTools: string[] = [];
    const mockPi = {
      tool: (name: string) => { registeredTools.push(name); },
      on: () => {},
    };

    const factories = getBundledFactories({
      ...defaultConfig,
      extensions: {
        core: {
          ...defaultConfig.extensions.core,
          sandbox: false,        // skip sandbox (needs npm install)
          git_checkpoint: false, // skip git checkpoint
        },
      },
    } as any);

    // Run all factories with the mock pi
    for (const factory of factories) {
      try {
        await (factory as any)(mockPi);
      } catch {
        // Some factories may fail to import in test env; that's ok
      }
    }

    // After running all factories, the budget tools should be registered
    expect(registeredTools).toContain('set_budget');
    expect(registeredTools).toContain('check_budget');
    expect(registeredTools).toContain('budget_status');
  });
});
