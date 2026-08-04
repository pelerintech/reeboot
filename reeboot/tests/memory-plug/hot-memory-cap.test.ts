import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import {
  builtinMemoryProvider,
} from '../../src/extensions/memory-manager.js';
import {
  STANDARD_CAPABILITIES,
  type MemoryProvider,
} from '@src/memory-provider.js';
import { HOT_MEMORY_HEADER } from '../../src/extensions/hot-memory.js';

function selfServingProvider(id: string): MemoryProvider {
  return {
    id,
    async store() { return { id: 'x' }; },
    async update() {},
    async forget() {},
    async recall() { return []; },
    async clear() {},
    async grounding() { return ''; },
    listCapabilities() {
      // A backend that self-serves retrieval declares its own hot-retrieval capability.
      return [{ name: 'hot-retrieval', description: 'hot retrieval', parameters: {}, key: STANDARD_CAPABILITIES.hotMemory }];
    },
  };
}

describe('hot-memory folded under the provider (capability-declared)', () => {
  it('builtin declares its hot-memory capability in the registry', () => {
    const provider = builtinMemoryProvider(
      { memoryPath: join(tmpdir(), 'MEMORY.md'), userPath: join(tmpdir(), 'USER.md') },
      { memory: 2200, user: 1375 }
    );
    const caps = provider.listCapabilities();
    expect(caps.some((c) => c.key === STANDARD_CAPABILITIES.hotMemory)).toBe(true);
  });

  it('builtin (non-self-serving) runs reeboot own hot-memory wiring', () => {
    // Hot-memory is folded under the provider (builtin owns hot injection via
    // grounding and session distillation via store(source:'session')). The
    // `shouldRunReebootHotMemory` routing coordinator was pruned — builtin
    // always owns its hot layer.
    const provider = builtinMemoryProvider(
      { memoryPath: join(tmpdir(), 'MEMORY.md'), userPath: join(tmpdir(), 'USER.md') },
      { memory: 2200, user: 1375 }
    );
    expect(provider.id).toBe('builtin');
    expect(provider.listCapabilities().some((c) => c.key === STANDARD_CAPABILITIES.hotMemory)).toBe(true);
  });

  it('a self-serving provider declares its own hot-retrieval capability (retrieval is external content)', () => {
    const provider = selfServingProvider('dreem');
    expect(provider.id).toBe('dreem');
    expect(provider.listCapabilities().some((c) => c.key === STANDARD_CAPABILITIES.hotMemory)).toBe(true);
  });

  it('builtin recall merges hot-memory entries as a recall layer (provider owns hot vs cold)', async () => {
    const dir = join(tmpdir(), `hm-rec-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(join(dir, 'hot-memory.md'),
        HOT_MEMORY_HEADER +
          '## 2026-08-01 10:00 — Quantum computing\nSummary: User researched quantum annealing.\nConclusions: Gate-based is more flexible.\n\n', 'utf-8');
      const provider = builtinMemoryProvider(
        { memoryPath: join(dir, 'MEMORY.md'), userPath: join(dir, 'USER.md') },
        { memory: 2200, user: 1375 }
      );

      const cold = await provider.recall('self', 'quantum annealing');
      // hot-memory content is surfaced through the provider's own recall — the
      // consumer does not care which backing store held the match.
      expect(cold.some((h) => h.content.includes('quantum annealing'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builtin hot-memory capability carries a functional execute handler (stores via provider)', async () => {
    const dir = join(tmpdir(), `hm-ex-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    try {
      const provider = builtinMemoryProvider(
        { memoryPath: join(dir, 'MEMORY.md'), userPath: join(dir, 'USER.md') },
        { memory: 2200, user: 1375 }
      );
      const cap = provider.listCapabilities().find((c) => c.key === STANDARD_CAPABILITIES.hotMemory);
      expect(cap).toBeDefined();
      expect(typeof cap!.execute).toBe('function');

      await cap!.execute!({ title: 'A topic', summary: 'A summary', conclusions: 'A conclusion' });
      const persisted = readFileSync(join(dir, 'hot-memory.md'), 'utf-8');
      expect(persisted).toContain('A topic');
      expect(persisted).toContain('A summary');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
