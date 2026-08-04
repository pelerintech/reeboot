import { describe, it, expect } from 'vitest';
import { MemoryManager, type MemoryProvider, type MemoryScope, type MemoryRef } from '@src/memory-provider.js';

/**
 * A spy provider that records exactly what the manager passes to the provider
 * contract — it must receive opaque refs + scope tokens and nothing else.
 * It deliberately throws if the manager inspects or transforms refs.
 */
function spyProvider(id: string, calls: string[]): MemoryProvider {
  return {
    id,
    async store(scope: MemoryScope, content: string): Promise<MemoryRef> {
      calls.push(`store:${scope}:${content}`);
      return { id: `${id}-ref` };
    },
    async update(scope: MemoryScope, ref: MemoryRef, content: string) {
      calls.push(`update:${scope}:${ref.id}:${content}`);
    },
    async forget(scope: MemoryScope, ref: MemoryRef) {
      calls.push(`forget:${scope}:${ref.id}`);
    },
    async recall(scope: MemoryScope, query: string, limit?: number) {
      calls.push(`recall:${scope}:${query}:${limit ?? 'none'}`);
      return [];
    },
    async clear(scope: MemoryScope) {
      calls.push(`clear:${scope}`);
    },
    async grounding(opts?: { scope?: MemoryScope; maxChars?: number }) {
      calls.push(`grounding:${opts?.scope ?? 'default'}:${opts?.maxChars ?? 'none'}`);
      return `[${id} grounding]`;
    },
    listCapabilities() {
      return [];
    },
  };
}

describe('MemoryManager routes via refs + scope', () => {
  it('defaults to builtin when nothing is configured', () => {
    const mgr = new MemoryManager(spyProvider('builtin', []));
    expect(mgr.active.id).toBe('builtin');
  });

  it('selects a registered provider', () => {
    const mgr = new MemoryManager(spyProvider('builtin', []));
    mgr.register(spyProvider('mem0', []));
    mgr.select('mem0');
    expect(mgr.active.id).toBe('mem0');
  });

  it('falls back to builtin for an unknown provider', () => {
    const mgr = new MemoryManager(spyProvider('builtin', []));
    mgr.register(spyProvider('dreem', []));
    mgr.select('does-not-exist');
    expect(mgr.active.id).toBe('builtin');
  });

  it('logs a warning when an unregistered provider falls back to builtin', () => {
    const warns: string[] = [];
    const mgr = new MemoryManager(spyProvider('builtin', []), (m) => warns.push(m));
    mgr.register(spyProvider('dreem', []));
    mgr.select('mem0');
    expect(mgr.active.id).toBe('builtin');
    expect(warns.length).toBeGreaterThan(0);
    expect(warns[0]).toMatch(/falling back to/i);
  });

  it('routes core ops passing only opaque refs + scope tokens (S5)', async () => {
    const calls: string[] = [];
    const mgr = new MemoryManager(spyProvider('builtin', calls));

    // The manager itself dispatches the core ops to the active provider.
    const ref = await mgr.store('self', 'hello');
    await mgr.update('self', ref, 'hello world');
    await mgr.forget('human', ref);
    await mgr.recall('both', 'query', 5);
    await mgr.clear('self');
    await mgr.grounding({ maxChars: 100 });

    // Manager does NOT transform refs: the ref surfaced by store is forwarded
    // verbatim to update/forget — never inspected, never re-addressed.
    expect(calls).toContain('store:self:hello');
    expect(calls).toContain(`update:self:${ref.id}:hello world`);
    expect(calls).toContain(`forget:human:${ref.id}`);
    expect(calls).toContain('recall:both:query:5');
    expect(calls).toContain('clear:self');
    expect(calls).toContain('grounding:default:100');
  });
});
