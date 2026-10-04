import { describe, it, expect, vi, beforeEach } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';

const WORKSPACE = mkdtempSync(join(tmpdir(), 'reeboot-toolset-'));

// Capture the resource-loader options reeboot passes to pi's DefaultResourceLoader.
let capturedOptions: any;

beforeEach(() => {
  vi.resetModules();
  capturedOptions = undefined;
  vi.doMock('@earendil-works/pi-coding-agent', () => ({
    DefaultResourceLoader: class {
      agentDir: string;
      extensionFactories: any[];
      constructor(opts: any) {
        capturedOptions = opts;
        this.agentDir = opts.agentDir;
        this.extensionFactories = opts.extensionFactories ?? [];
      }
      async reload() {}
      getExtensions() { return { extensions: [], errors: [] }; }
      getSkills() { return { skills: [], diagnostics: [] }; }
      getPrompts() { return { prompts: [], diagnostics: [] }; }
      getThemes() { return { themes: [], diagnostics: [] }; }
      getAgentsFiles() { return { agentsFiles: [] }; }
      getSystemPrompt() { return undefined; }
      getAppendSystemPrompt() { return []; }
    },
  }));
});

describe('pi mode tool-surface containment (toolset)', () => {
  it('createLoader does not pass any pi built-in extension factory to the resource loader', async () => {
    const { createLoader } = await import('../../src/extensions/loader.js');
    createLoader({ id: 'main', workspacePath: WORKSPACE }, {
      extensions: { core: { sandbox: true, confirm_destructive: true, protected_paths: true } },
    } as any);

    expect(capturedOptions).toBeDefined();
    const factories = capturedOptions.extensionFactories ?? [];

    // No factory is a pi built-in `{ builtin:true }` inline extension.
    const builtins = factories.filter(
      (f: any) => typeof f === 'object' && f !== null && f.builtin === true
    );
    expect(builtins).toEqual([]);

    // No factory is literally a pi built-in name (codemode / tool-search / mcp / llama.cpp).
    const forbiddenNames = ['codemode', 'tool-search', 'tool_search', 'mcp', 'llama.cpp', 'llama-cpp'];
    for (const f of factories) {
      if (typeof f === 'object' && f !== null && typeof f.name === 'string') {
        expect(forbiddenNames).not.toContain(f.name);
      }
    }
  });

  it('createLoader passes reeboot-owned factories only (no pi-default extensions injected)', async () => {
    const { createLoader, getBundledFactories } = await import('../../src/extensions/loader.js');
    createLoader({ id: 'main', workspacePath: WORKSPACE }, {
      extensions: { core: { sandbox: true, confirm_destructive: true, protected_paths: true } },
    } as any);

    const reebootCount = getBundledFactories({ id: 'main', workspacePath: WORKSPACE }, {
      extensions: { core: { sandbox: true, confirm_destructive: true, protected_paths: true } },
    } as any).length;

    // The loader receives exactly reeboot's own bundled factories (plus any
    // additionalExtensionPaths it adds), not a superset injected by pi.
    expect(capturedOptions.extensionFactories.length).toBe(reebootCount);
  });
});
