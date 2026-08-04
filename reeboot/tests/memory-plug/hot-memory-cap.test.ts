import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  builtinMemoryProvider,
  shouldRunReebootHotMemory,
} from '../../src/extensions/memory-manager.js';
import {
  STANDARD_CAPABILITIES,
  type MemoryProvider,
} from '@src/memory-provider.js';

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
    const provider = builtinMemoryProvider(
      { memoryPath: join(tmpdir(), 'MEMORY.md'), userPath: join(tmpdir(), 'USER.md') },
      { memory: 2200, user: 1375 }
    );
    expect(shouldRunReebootHotMemory(provider)).toBe(true);
  });

  it('a self-serving provider prevents reeboot own hot-memory wiring', () => {
    const provider = selfServingProvider('dreem');
    expect(provider.id).toBe('dreem');
    expect(shouldRunReebootHotMemory(provider)).toBe(false);
  });
});
