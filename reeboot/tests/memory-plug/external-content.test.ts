import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { makeMemoryExtension } from '../../src/extensions/memory-manager.js';
import { effectiveExternalSourceTools, resetExternalSourceTools } from '../../src/security/external-tools.js';
import type { MemoryProvider, CapabilityDef } from '../../src/memory-provider.js';

/**
 * Gap: capability-registry-trust S6 — "Provider recall output is treated as
 * untrusted external content. ... WHEN they are not from the local builtin store
 * THEN injection-guard's external-source policy (treat-as-data) applies to them."
 *
 * Provider-declared capability tools that surface backend memory content (from a
 * non-builtin provider such as dreem) must be part of the external-source tool
 * set so injection-guard's treat-as-data policy + pi-runner output scanning apply
 * to them, consistent with other external tool output. Builtin (the local store)
 * must NOT be treated as external.
 */
function makePi() {
  const tools = new Map<string, any>();
  return {
    pi: {
      registerTool: vi.fn((def: any) => { tools.set(def.name, def); }),
      on() {},
    },
    getTool(name: string) { return tools.get(name); },
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
    listCapabilities() { return caps; },
  };
}

describe('capability-registry-trust S6 — provider recall output is untrusted external content', () => {
  let tmpDir: string;
  beforeEach(() => {
    resetExternalSourceTools();
    tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-external-'));
  });
  afterEach(() => {
    resetExternalSourceTools();
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('treats a non-builtin provider capability tool as external-source content', () => {
    const fake = capProvider('dreem', [
      { name: 'graph', description: 'Explore the dreem knowledge graph.', parameters: {} },
    ]);
    const { pi } = makePi();
    makeMemoryExtension(pi as any, {
      memory: { provider: 'dreem', enabled: true, providerConfig: { baseUrl: 'http://x' }, consolidation: { enabled: false } },
    } as any, join(tmpDir, 'memories'), [fake]);

    // Registered namespaced and flagged as an external source for the agent.
    expect(pi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: 'memory::dreem::graph' }));
    expect(effectiveExternalSourceTools(['fetch_url'])).toContain('memory::dreem::graph');
  });

  it('does NOT treat builtin capability tools as external (local store)', () => {
    const { pi } = makePi();
    makeMemoryExtension(pi as any, {
      memory: { provider: 'builtin', enabled: true, providerConfig: { consolidation: { enabled: false } } },
    } as any, join(tmpDir, 'memories'));

    // builtin's hot-memory tool is local — not external.
    expect(effectiveExternalSourceTools(['fetch_url'])).not.toContain('memory::builtin::hot-memory');
  });
});
