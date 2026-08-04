import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  makeMemoryExtension,
  registerProvider,
  resolveProvider,
  createProviderFactoryRegistry,
} from '../../src/extensions/memory-manager.js';
import type { MemoryProvider } from '@src/memory-provider.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `provider-factory-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function makeMockPi() {
  const tools = new Map<string, any>();
  return {
    pi: {
      registerTool(def: any) {
        tools.set(def.name, def);
      },
      on() {},
    },
    getTool(name: string) {
      return tools.get(name);
    },
  };
}

describe('provider-factory registry constructs the selected provider from typed providerConfig', () => {
  it('constructs builtin from its typed providerConfig limits', async () => {
    const { pi, getTool } = makeMockPi();
    const dir = join(tmpDir, 'memories');
    const seen: any[] = [];
    registerProvider('builtin', (cfg: any) => {
      seen.push(cfg);
      // fall back to the real builtin construction for the default path
      return null;
    });
    makeMemoryExtension(pi as any, {
      memory: {
        provider: 'builtin',
        enabled: true,
        providerConfig: { memoryCharLimit: 777, userCharLimit: 333, consolidation: { enabled: true } },
      },
    } as any, dir, []);
    const tool = getTool('memory');
    expect(tool).toBeDefined();
    // builtin factory received the typed config
    expect(seen).toHaveLength(1);
    expect(seen[0].memoryCharLimit).toBe(777);
    expect(seen[0].userCharLimit).toBe(333);
    expect(seen[0].consolidation.enabled).toBe(true);
  });

  it('constructs a fake provider and routes through it from typed providerConfig', async () => {
    const { pi, getTool } = makeMockPi();
    const dir = join(tmpDir, 'memories');
    const writes: string[] = [];
    registerProvider('fake', (cfg: any) => {
      const p: MemoryProvider = {
        id: 'fake',
        async store(scope, content) { writes.push(`${scope}:${content}`); return { id: 'f' }; },
        async update() {},
        async forget() {},
        async recall() { return []; },
        async clear() {},
        async grounding() { return ''; },
        listCapabilities() { return []; },
      };
      return p;
    });
    makeMemoryExtension(pi as any, {
      memory: { provider: 'fake', enabled: true, providerConfig: { anyKey: 1 } },
    } as any, dir, []);

    const tool = getTool('memory');
    await (tool.execute('id', { action: 'add', target: 'memory', content: 'x' }));
    expect(writes).toContain('self:x');
  });

  it('falls back to builtin when the factory registry has no constructor for the id', async () => {
    const { pi, getTool } = makeMockPi();
    const dir = join(tmpDir, 'memories');
    // 'mem0' is a valid enum value but no factory is registered for it → builtin fallback.
    makeMemoryExtension(pi as any, {
      memory: { provider: 'mem0', enabled: true },
    } as any, dir, []);
    const tool = getTool('memory');
    expect(tool).toBeDefined();
  });

  it('resolveProvider returns null for an id with no registered factory', () => {
    const reg = createProviderFactoryRegistry();
    const p = resolveProvider(reg, 'not-registered', { anything: 1 });
    expect(p).toBeNull();
  });
});
