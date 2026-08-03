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

  it('logs a warning when an unregistered provider falls back to builtin', () => {
    const warns: string[] = [];
    const mgr = new MemoryManager(fakeProvider('builtin'), (m) => warns.push(m));
    mgr.register(fakeProvider('dreem'));
    // 'mem0' is a valid enum value but no provider is registered for it.
    mgr.select('mem0');
    expect(mgr.active.id).toBe('builtin');
    expect(warns.length).toBeGreaterThan(0);
    expect(warns[0]).toMatch(/falling back to/i);
  });
});
