import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  makeMemoryExtension,
  builtinMemoryProvider,
  initMemoryFiles,
} from '../../src/extensions/memory-manager.js';
import type { MemoryProvider } from '@src/memory-provider.js';

function makeMockPi() {
  const tools = new Map<string, any>();
  const handlers = new Map<string, any>();
  return {
    pi: {
      registerTool(def: any) {
        tools.set(def.name, def);
      },
      on(event: string, fn: any) {
        handlers.set(event, fn);
      },
    },
    getTool(name: string) {
      return tools.get(name);
    },
    getHandler(event: string) {
      return handlers.get(event);
    },
  };
}

function baseConfig(provider?: string) {
  return {
    memory: {
      ...(provider ? { provider } : {}),
      enabled: true,
      memoryCharLimit: 2200,
      userCharLimit: 1375,
      consolidation: { enabled: false },
    },
  };
}

describe('session end routes the full conversation through manager → provider', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('session_shutdown (reason new) forwards the FULL session transcript via store(source: session)', async () => {
    // Inject more than the old 200-row cap to prove the manager no longer
    // hard-cuts the conversation before forwarding it to the provider.
    vi.mock('../../src/db/index.js', () => ({
      getDb: () => {
        const allRows = Array.from({ length: 250 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `msg ${i}`,
          created_at: `2026-08-01 10:00`,
        }));
        return {
          prepare: () => ({ all: () => allRows }),
        };
      },
    }));

    const { makeMemoryExtension: makeMem } = await import('../../src/extensions/memory-manager.js');
    const { pi, getHandler } = makeMockPi();
    const received: any[] = [];
    const dreem: MemoryProvider = {
      id: 'dreem',
      async store(scope: any, content: any, opts?: any) {
        received.push({ scope, content, opts });
        return { id: 'r' };
      },
      async update() {},
      async forget() {},
      async recall() { return []; },
      async clear() {},
      async grounding() { return ''; },
      listCapabilities() { return []; },
    };

    makeMem(pi as any, baseConfig('dreem') as any, join(tmpdir(), 'memories'), [dreem]);
    const handler = getHandler('session_shutdown');
    expect(handler).toBeDefined();

    await handler({ type: 'session_shutdown', sessionId: 's1', reason: 'new' });

    // The manager forwards the FULL raw transcript with the session source
    // signal — no 200-row cap — and does not distill.
    expect(received.length).toBe(1);
    const call = received[0];
    expect(call.opts?.source).toBe('session');
    expect(Array.isArray(call.content)).toBe(true);
    expect(call.content.length).toBe(250);
  });
});

describe('builtin distills a session transcript into hot memory (provider job)', () => {
  it('store(source: session) writes a distilled summary to hot-memory.md', async () => {
    const dir = join(tmpdir(), `session-distill-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    initMemoryFiles(dir);
    try {
      const provider = builtinMemoryProvider(
        { memoryPath: join(dir, 'MEMORY.md'), userPath: join(dir, 'USER.md') },
        { memory: 2200, user: 1375 },
        {
          llmCall: async (_prompt: string) =>
            'TITLE: Quantum\nSUMMARY: User researched quantum annealing.\nCONCLUSIONS: Gate-based more flexible.',
        }
      );

      await provider.store('self', [
        { role: 'user', content: 'Tell me about quantum computing.' },
        { role: 'assistant', content: 'Quantum annealing vs gate-based.' },
      ], { source: 'session' });

      const { readFileSync } = await import('fs');
      const persisted = readFileSync(join(dir, 'hot-memory.md'), 'utf-8');
      expect(persisted).toContain('Quantum');
      expect(persisted).toContain('quantum annealing');
    } finally {
      const { rmSync } = await import('fs');
      const { existsSync } = await import('fs');
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
  });
});
