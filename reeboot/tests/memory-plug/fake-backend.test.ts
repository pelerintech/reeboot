import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { makeMemoryExtension } from '../../src/extensions/memory-manager.js';
import type { MemoryProvider } from '../../src/memory-provider.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `fake-backend-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

// A heterogeneous backend shape — an in-memory store, NOT a file pair, proving the
// seam accepts a backend that is fundamentally different from the builtin file store.
function makeInMemoryProvider(): {
  provider: MemoryProvider;
  state: string[];
  promptBlocks: string[];
} {
  const state: string[] = [];
  const promptBlocks: string[] = [];
  return {
    provider: {
      id: 'in-memory-fake',
      add: (_t, c) => { state.push(c); return `ok:${state.length}`; },
      replace: (t, o, c) => {
        const i = state.findIndex((e) => e.includes(o));
        if (i >= 0) state[i] = c;
        return `replace:${t}`;
      },
      remove: (t) => { state.pop(); return `remove:${t}`; },
      read: () => state.join('\n'),
      clear: () => { state.length = 0; },
      buildSystemPromptContribution: () => { promptBlocks.push('fake-block'); return 'FAKE-SYSTEM-BLOCK'; },
    },
    state,
    promptBlocks,
  };
}

function makeMockPi() {
  const tools = new Map<string, any>();
  const handlers: Record<string, Function[]> = {};
  let prompt = '';
  return {
    pi: {
      registerTool(def: any) { tools.set(def.name, def); },
      on(event: string, handler: Function) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      },
    },
    getTool(name: string) { return tools.get(name); },
    async fireBeforeAgentStart() {
      const hs = handlers['before_agent_start'] ?? [];
      for (const h of hs) {
        const r = await h({ systemPrompt: '' });
        if (r?.systemPrompt) prompt = r.systemPrompt;
      }
      return prompt;
    },
    async call(tool: any, params: any) {
      const res = await tool.execute('id', params);
      if (Array.isArray(res?.content)) return res.content.map((c: any) => c.text).join('');
      return String(res);
    },
  };
}

describe('seam accepts a second heterogeneous backend', () => {
  it('routes both memory operations and system-prompt contribution to the fake', async () => {
    const { pi, getTool, fireBeforeAgentStart, call } = makeMockPi();
    const { provider, state, promptBlocks } = makeInMemoryProvider();
    const config = {
      memory: {
        provider: 'in-memory-fake',
        enabled: true,
        memoryCharLimit: 2200,
        userCharLimit: 1375,
        consolidation: { enabled: false },
      },
    };
    makeMemoryExtension(pi as any, config as any, join(tmpDir, 'memories'), [provider]);

    // memory tool ops route to the fake (not the file system)
    await call(getTool('memory'), { action: 'add', target: 'memory', content: 'alpha' });
    await call(getTool('memory'), { action: 'replace', target: 'memory', old_text: 'alpha', content: 'beta' });
    expect(state).toEqual(['beta']);

    // system-prompt contribution comes from the fake
    const prompt = await fireBeforeAgentStart();
    expect(promptBlocks).toHaveLength(1);
    expect(prompt).toContain('FAKE-SYSTEM-BLOCK');
  });
});
