import { describe, it, expect, vi } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';

describe('createLoader (2.1)', () => {
  it('returns an object with a reload method', async () => {
    const { createLoader } = await import('@src/extensions/loader.js');
    const loader = createLoader({ id: 'main', workspacePath: '/tmp/ctx' }, {
      extensions: { core: { sandbox: true, confirm_destructive: true, protected_paths: true, git_checkpoint: false } }
    } as any);
    expect(typeof loader.reload).toBe('function');
  });

  it('loader has required ResourceLoader methods', async () => {
    const { createLoader } = await import('@src/extensions/loader.js');
    const loader = createLoader({ id: 'main', workspacePath: '/tmp/ctx' }, {} as any);
    expect(typeof loader.getExtensions).toBe('function');
    expect(typeof loader.getSkills).toBe('function');
    expect(typeof loader.reload).toBe('function');
  });

  it('sandbox extension excluded when disabled in config', async () => {
    const { createLoader, getBundledFactories } = await import('@src/extensions/loader.js');
    // With sandbox=false the factories list should not include sandbox
    const factories = getBundledFactories({
      extensions: { core: { sandbox: false, confirm_destructive: true, protected_paths: true, git_checkpoint: false } }
    } as any);
    // sandbox factory is at index 0 when enabled; with sandbox=false length should be one less
    const allFactories = getBundledFactories({
      extensions: { core: { sandbox: true, confirm_destructive: true, protected_paths: true, git_checkpoint: false } }
    } as any);
    expect(factories.length).toBe(allFactories.length - 1);
  });

  it('git_checkpoint excluded by default', async () => {
    const { getBundledFactories } = await import('@src/extensions/loader.js');
    const withDefault = getBundledFactories({} as any);
    const withGit = getBundledFactories({
      extensions: { core: { git_checkpoint: true } }
    } as any);
    expect(withGit.length).toBe(withDefault.length + 1);
  });

  it('web-search factory passes config as second argument to extension', async () => {
    const { getBundledFactories } = await import('@src/extensions/loader.js');
    const config = { search: { provider: 'duckduckgo' } } as any;
    const factories = getBundledFactories(config);

    // Find the web-search factory — it's the one that imports web-search.ts
    // We mock the module and invoke each factory to find which one calls our mock
    let capturedArgs: any[] = [];
    const mockDefault = vi.fn(async (...args: any[]) => { capturedArgs = args; });

    vi.doMock(join(process.cwd(), 'extensions/web-search.ts'), () => ({
      default: mockDefault,
    }));

    const mockPi = { registerTool: vi.fn() };

    // Invoke all factories — the web-search one should call mockDefault with (pi, config)
    for (const factory of factories) {
      try { await (factory as any)(mockPi); } catch { /* ignore other factory errors */ }
    }

    // mockDefault should have been called with pi + config
    expect(mockDefault).toHaveBeenCalled();
    const [piArg, configArg] = capturedArgs;
    expect(piArg).toBe(mockPi);
    expect(configArg).toBe(config);

    vi.doUnmock(join(process.cwd(), 'extensions/web-search.ts'));
  });
});
