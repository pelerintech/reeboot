import { describe, it, expect } from 'vitest';
import { MemoryManager, type MemoryProvider } from '@src/memory-provider.js';

function fakeProvider(id: string): MemoryProvider {
  return {
    id,
    add: () => '',
    replace: () => '',
    remove: () => '',
    read: () => '',
    clear: () => {},
    buildSystemPromptContribution: () => `[${id}]`,
  };
}

describe('MemoryManager', () => {
  it('defaults to builtin when nothing is configured', () => {
    const mgr = new MemoryManager(fakeProvider('builtin'));
    expect(mgr.active.id).toBe('builtin');
  });

  it('selects a registered provider', () => {
    const mgr = new MemoryManager(fakeProvider('builtin'));
    const mem0 = fakeProvider('mem0');
    mgr.register(mem0);
    mgr.select('mem0');
    expect(mgr.active.id).toBe('mem0');
  });

  it('falls back to builtin for an unknown provider', () => {
    const mgr = new MemoryManager(fakeProvider('builtin'));
    mgr.register(fakeProvider('dreem'));
    mgr.select('does-not-exist');
    expect(mgr.active.id).toBe('builtin');
  });
});
