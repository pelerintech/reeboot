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

  it('agentDir is always ~/.reeboot/agent/ regardless of authMode', async () => {
    const { createLoader } = await import('@src/extensions/loader.js');
    const loaderPi = createLoader(
      { id: 'main', workspacePath: '/tmp/ctx' },
      { agent: { model: { authMode: 'pi' } } } as any
    );
    const loaderOwn = createLoader(
      { id: 'main', workspacePath: '/tmp/ctx' },
      { agent: { model: { authMode: 'own' } } } as any
    );
    expect((loaderPi as any).agentDir).toMatch(/\.reeboot[/\\]agent$/);
    expect((loaderOwn as any).agentDir).toMatch(/\.reeboot[/\\]agent$/);
  });

  it('web-search factory passes config as second argument to extension', async () => {
    // The web-search factory does: await (mod.default)(pi, config)
    // We verify this by importing the real web-search module and checking
    // that with a duckduckgo config, web_search tool gets registered
    const registeredTools: string[] = [];
    const mockPi = {
      registerTool: vi.fn((opts: { name: string }) => { registeredTools.push(opts.name); }),
    };

    const { getBundledFactories } = await import('@src/extensions/loader.js');
    const config = { search: { provider: 'duckduckgo' } } as any;
    const factories = getBundledFactories(config);

    // Invoke all factories
    for (const factory of factories) {
      try { await (factory as any)(mockPi); } catch { /* ignore other factory errors */ }
    }

    // web_search should be registered because provider is duckduckgo (not "none")
    expect(registeredTools).toContain('web_search');
    expect(registeredTools).toContain('fetch_url');
  });
});
