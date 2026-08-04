import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { makeMemoryExtension } from '../../src/extensions/memory-manager.js';
import type { MemoryProvider, CapabilityDef } from '@src/memory-provider.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `capability-registry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
    getToolNames() {
      return [...tools.keys()];
    },
  };
}

function capProvider(id: string, caps: CapabilityDef[]): MemoryProvider {
  return {
    id,
    async store() { return { id: 'x' }; },
    async update() {},
    async forget() {},
    async recall() { return []; },
    async clear() {},
    async grounding() { return ''; },
    listCapabilities() {
      return caps;
    },
  };
}

describe('capability registry — uniform registration', () => {
  it('registers one namespaced tool per declared capability (S1, S2)', async () => {
    const { pi, getToolNames } = makeMockPi();
    const dreem = capProvider('dreem', [
      { name: 'graph', description: 'Explore the knowledge graph', parameters: {} },
      { name: 'health', description: 'Check backend health', parameters: {} },
    ]);
    makeMemoryExtension(pi as any, {
      memory: { provider: 'dreem', enabled: true, consolidation: { enabled: false } },
    } as any, join(tmpDir, 'memories'), [dreem]);

    const names = getToolNames();
    // The standard tools are always present
    expect(names).toContain('memory');
    expect(names).toContain('session_search');
    // One namespaced tool per declared capability
    expect(names).toContain('memory::dreem::graph');
    expect(names).toContain('memory::dreem::health');
  });

  it('uses the same mechanism for builtin and any provider', async () => {
    const { pi, getToolNames } = makeMockPi();
    const fake = capProvider('mem0', [
      { name: 'search', description: 'semantic search', parameters: {} },
    ]);
    // builtin declares nothing extra by default here
    makeMemoryExtension(pi as any, {
      memory: { provider: 'mem0', enabled: true, consolidation: { enabled: false } },
    } as any, join(tmpDir, 'memories'), [fake]);

    expect(getToolNames()).toContain('memory::mem0::search');
  });

  it('registers capability tools that execute against the provider', async () => {
    const { pi, getTool } = makeMockPi();
    const calls: string[] = [];
    const provider: MemoryProvider = capProvider('dreem', []);
    provider.listCapabilities = () => [{
      name: 'graph',
      description: 'Explore the knowledge graph',
      parameters: {},
      execute: (p) => { calls.push(`graph:${JSON.stringify(p)}`); return 'graph-ok'; },
    }];
    makeMemoryExtension(pi as any, {
      memory: { provider: 'dreem', enabled: true, consolidation: { enabled: false } },
    } as any, join(tmpDir, 'memories'), [provider]);

    const tool = getTool('memory::dreem::graph');
    expect(tool).toBeDefined();
    const res = await tool.execute('id', { limit: 5 }, undefined, undefined, {});
    expect(res).toBeDefined();
    expect(calls).toContain('graph:{"limit":5}');
  });
});
