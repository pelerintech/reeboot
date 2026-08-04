import { describe, it, expect } from 'vitest';
import {
  MEMORY_SCOPES,
  MEMORY_SOURCES,
  type MemoryScope,
  type MemoryRef,
  type MemoryHit,
  type CapabilityDef,
  type MemoryProvider,
  type SessionTranscript,
  type MemorySource,
  type StoreOptions,
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

  it('store accepts a source signal and session/transcript input via opts (distillation is a provider job)', async () => {
    // The contract names the source kinds that route through a single store action.
    expect(MEMORY_SOURCES).toEqual(['entry', 'session', 'consolidation']);

    const sources: MemorySource[] = ['entry', 'session', 'consolidation'];
    for (const s of sources) {
      const opts: StoreOptions = { source: s };
      expect(opts.source).toBe(s);
    }

    // A raw session transcript is first-class input to store — the provider
    // decides internally what distillation (if any) is required.
    const transcript: SessionTranscript = [
      { role: 'user', content: 'Can you research quantum computing?' },
      { role: 'assistant', content: 'Quantum annealing vs gate-based models.' },
    ];

    const provider: MemoryProvider = {
      id: 'fake',
      async store(_scope: MemoryScope, content: string | SessionTranscript, opts?: StoreOptions): Promise<MemoryRef> {
        void content; void opts;
        return { id: 'opaque-handle' };
      },
      async update(_scope: MemoryScope, ref: MemoryRef) { void ref; },
      async forget(_scope: MemoryScope, ref: MemoryRef) { void ref; },
      async recall(_scope: MemoryScope, query: string, limit?: number): Promise<MemoryHit[]> {
        void query; void limit; return [];
      },
      async clear(_scope: MemoryScope) {},
      async grounding(opts?: { scope?: MemoryScope; maxChars?: number }): Promise<string> {
        void opts; return '';
      },
      listCapabilities(): CapabilityDef[] { return []; },
    };

    // A provider must accept a transcript with the session source signal.
    await provider.store('self', transcript, { source: 'session' });
  });
});
