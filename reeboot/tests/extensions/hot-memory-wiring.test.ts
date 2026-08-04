import { describe, it, expect } from 'vitest';

describe('hot-memory folded under the provider (no longer a standalone extension)', () => {
  it('module is importable and exposes the pure distill/data-model helpers', async () => {
    const mod = await import('../../src/extensions/hot-memory.js');
    expect(typeof mod.HOT_MEMORY_HEADER).toBe('string');
    expect(typeof mod.initHotMemoryFile).toBe('function');
    expect(typeof mod.readHotMemoryFile).toBe('function');
    expect(typeof mod.formatHotMemoryEntry).toBe('function');
    expect(typeof mod.pruneEntries).toBe('function');
    expect(typeof mod.parseHotMemoryFile).toBe('function');
    expect(typeof mod.parseDistillResponse).toBe('function');
    expect(typeof mod.distillSession).toBe('function');
    expect(typeof mod.buildHotMemoryBlock).toBe('function');
  });

  it('does NOT expose standalone extension wiring (makeHotMemoryExtension is gone)', async () => {
    const mod = await import('../../src/extensions/hot-memory.js');
    // The extension used to register before_agent_start/session_shutdown hooks; that
    // wiring moved into the memory provider (builtin owns hot injection in grounding()
    // and session distillation via store(source:'session')). No default export remains.
    expect((mod as any).makeHotMemoryExtension).toBeUndefined();
    expect((mod as any).default).toBeUndefined();
  });
});
