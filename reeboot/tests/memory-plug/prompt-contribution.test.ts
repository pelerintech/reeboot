import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { makeMemoryExtension } from '../../src/extensions/memory-manager.js';
import type { MemoryProvider } from '../../src/memory-provider.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `prompt-contribution-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function makeMockPi() {
  const handlers: Record<string, Function[]> = {};
  let systemPromptResult = '';
  return {
    pi: {
      registerTool() {},
      on(event: string, handler: Function) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      },
    },
    async fireBeforeAgentStart(existing = '') {
      const hs = handlers['before_agent_start'] ?? [];
      for (const h of hs) {
        const result = await h({ systemPrompt: existing });
        if (result?.systemPrompt) systemPromptResult = result.systemPrompt;
      }
      return systemPromptResult;
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

describe('system-prompt contribution routed through the active provider', () => {
  it('uses the builtin provider contribution by default', async () => {
    const { pi, fireBeforeAgentStart } = makeMockPi();
    makeMemoryExtension(pi as any, baseConfig() as any, join(tmpDir, 'memories'));
    const prompt = await fireBeforeAgentStart();
    // builtin block contains the MEMORY header separator content
    expect(prompt).toContain('MEMORY (your personal notes)');
  });

  it('uses the alternate provider contribution when selected', async () => {
    const { pi, fireBeforeAgentStart } = makeMockPi();
    const alt: MemoryProvider = {
      id: 'mem0',
      async store() { return { id: 'x' }; },
      async update() {},
      async forget() {},
      async recall() { return []; },
      async clear() {},
      async grounding() { return '[MEM0-SYSTEM-BLOCK]'; },
      listCapabilities() { return []; },
    };
    makeMemoryExtension(pi as any, baseConfig('mem0') as any, join(tmpDir, 'memories'), [alt]);
    const prompt = await fireBeforeAgentStart();
    expect(prompt).toContain('[MEM0-SYSTEM-BLOCK]');
  });

  it('falls back to builtin contribution for an unknown provider', async () => {
    const { pi, fireBeforeAgentStart } = makeMockPi();
    makeMemoryExtension(pi as any, baseConfig('nope') as any, join(tmpDir, 'memories'));
    const prompt = await fireBeforeAgentStart();
    expect(prompt).toContain('MEMORY (your personal notes)');
  });
});
