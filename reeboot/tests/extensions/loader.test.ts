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
    const factories = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, {
      extensions: { core: { sandbox: false, confirm_destructive: true, protected_paths: true, git_checkpoint: false } }
    } as any);
    // sandbox factory is at index 0 when enabled; with sandbox=false length should be one less
    const allFactories = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, {
      extensions: { core: { sandbox: true, confirm_destructive: true, protected_paths: true, git_checkpoint: false } }
    } as any);
    expect(factories.length).toBe(allFactories.length - 1);
  });

  it('git_checkpoint excluded by default', async () => {
    const { getBundledFactories } = await import('@src/extensions/loader.js');
    const withDefault = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, {} as any);
    const withGit = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, {
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

  it('mcp-manager factory included by default', async () => {
    const { getBundledFactories } = await import('@src/extensions/loader.js');
    const withMcp = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, {} as any);
    const withoutMcp = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, {
      extensions: { core: { mcp: false } }
    } as any);
    expect(withMcp.length).toBe(withoutMcp.length + 1);
  });

  it('mcp-manager factory excluded when extensions.core.mcp is false', async () => {
    const { getBundledFactories } = await import('@src/extensions/loader.js');
    const withMcp = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, { extensions: { core: { mcp: true } } } as any);
    const withoutMcp = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, { extensions: { core: { mcp: false } } } as any);
    expect(withoutMcp.length).toBe(withMcp.length - 1);
  });

  it('injection-guard factory included by default', async () => {
    const { getBundledFactories } = await import('@src/extensions/loader.js');
    const withGuard = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, {} as any);
    const withoutGuard = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, {
      extensions: { core: { injection_guard: false } }
    } as any);
    expect(withGuard.length).toBe(withoutGuard.length + 1);
  });

  it('injection-guard factory excluded when extensions.core.injection_guard is false', async () => {
    const { getBundledFactories } = await import('@src/extensions/loader.js');
    const withGuard = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, { extensions: { core: { injection_guard: true } } } as any);
    const withoutGuard = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, { extensions: { core: { injection_guard: false } } } as any);
    expect(withoutGuard.length).toBe(withGuard.length - 1);
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
    const factories = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, config);

    // Invoke all factories
    for (const factory of factories) {
      try { await (factory as any)(mockPi); } catch { /* ignore other factory errors */ }
    }

    // web_search should be registered because provider is duckduckgo (not "none")
    expect(registeredTools).toContain('web_search');
    expect(registeredTools).toContain('fetch_url');
  });

  it('capabilities factory is included in bundled factories', async () => {
    const { getBundledFactories } = await import('@src/extensions/loader.js');
    const factories = getBundledFactories({ id: 'test', workspacePath: '/tmp' } as any, {} as any);

    // The capabilities factory should be present (always loaded, no feature flag)
    // We verify by checking that invoking all factories with a mock pi that
    // has getAllTools results in the ADDITIONAL CAPABILITIES block being injected
    const handlers: Record<string, Array<(event: any) => any>> = {};
    const mockPi = {
      getAllTools: vi.fn(() => []),
      on: vi.fn((event: string, handler: (event: any) => any) => {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      }),
    };

    for (const factory of factories) {
      try { await (factory as any)(mockPi); } catch { /* ignore errors from other factories */ }
    }

    // Fire before_agent_start and check for the capabilities-specific block
    expect(handlers['before_agent_start']?.length).toBeGreaterThanOrEqual(1);

    let foundCapabilitiesBlock = false;
    for (const handler of handlers['before_agent_start'] ?? []) {
      const result = await handler({ systemPrompt: 'test' });
      if (result?.systemPrompt?.includes('ADDITIONAL CAPABILITIES')) {
        foundCapabilitiesBlock = true;
      }
    }
    expect(foundCapabilitiesBlock).toBe(true);
  });
});
