import { describe, it, expect } from 'vitest';
import {
  MEMORY_SCOPES,
  type MemoryScope,
  type MemoryRef,
  type MemoryHit,
  type CapabilityDef,
  type MemoryProvider,
} from '@src/memory-provider.js';

describe('memory provider contract', () => {
  it('defines scope as a first-class singular axis via a runtime const', () => {
    // Value import — fails at RED until the reshaped contract exists at runtime.
    expect(MEMORY_SCOPES).toContain('self');
    expect(MEMORY_SCOPES).toContain('human');
    expect(MEMORY_SCOPES).toContain('both');
  });

  it('lets a provider express the full action-shaped interface', () => {
    const provider: MemoryProvider = {
      id: 'fake',
      async store(scope: MemoryScope, content: string): Promise<MemoryRef> {
        void scope; void content;
        return { id: 'opaque-handle' };
      },
      async update(_scope: MemoryScope, ref: MemoryRef) {
        void ref;
      },
      async forget(_scope: MemoryScope, ref: MemoryRef) {
        void ref;
      },
      async recall(_scope: MemoryScope, query: string, limit?: number): Promise<MemoryHit[]> {
        void query; void limit;
        return [];
      },
      async clear(_scope: MemoryScope) {},
      async grounding(opts?: { scope?: MemoryScope; maxChars?: number }): Promise<string> {
        void opts;
        return '';
      },
      listCapabilities(): CapabilityDef[] {
        return [];
      },
    };

    // Every provider must honor the six core ops + capability registry.
    expect(typeof provider.store).toBe('function');
    expect(typeof provider.update).toBe('function');
    expect(typeof provider.forget).toBe('function');
    expect(typeof provider.recall).toBe('function');
    expect(typeof provider.clear).toBe('function');
    expect(typeof provider.grounding).toBe('function');
    expect(typeof provider.listCapabilities).toBe('function');
  });

  it('MemoryRef is opaque and MemoryHit carries scope + content', async () => {
    const ref: MemoryRef = { id: 'abc123' };
    const hit: MemoryHit = { ref, scope: 'self', content: 'note', score: 0.9 };
    expect(hit.ref.id).toBe('abc123');
    expect(hit.scope).toBe('self');
    expect(hit.content).toBe('note');
  });
});
