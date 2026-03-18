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
});
