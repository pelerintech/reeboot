import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  makeMemoryExtension,
  builtinMemoryProvider,
  initMemoryFiles,
} from '../../src/extensions/memory-manager.js';
import type { MemoryProvider } from '../../src/memory-provider.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `builtin-provider-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function makeMockPi() {
  const tools = new Map<string, any>();
  return {
    pi: {
      registerTool(def: any) {
        tools.set(def.name, def);
      },
      on() {},
    },
    getTool(name: string) {
      return tools.get(name);
    },
  };
}

async function callTool(tool: any, params: any) {
  const res = await tool.execute('id', params);
  if (Array.isArray(res?.content)) return res.content.map((c: any) => c.text).join('');
  return String(res);
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

describe('builtin memory provider', () => {
  it('still mutates MEMORY.md as today', () => {
    const dir = join(tmpDir, 'memories');
    initMemoryFiles(dir);
    const provider = builtinMemoryProvider(
      { memoryPath: join(dir, 'MEMORY.md'), userPath: join(dir, 'USER.md') },
      { memory: 2200, user: 1375 }
    );
    provider.add('memory', 'hello world');
    expect(readFileSync(join(dir, 'MEMORY.md'), 'utf-8')).toContain('hello world');
  });
});

describe('memory tool routed through the active provider', () => {
  it('routes add to a configured alternate provider', async () => {
    const { pi, getTool } = makeMockPi();
    const calls: string[] = [];
    const alt: MemoryProvider = {
      id: 'dreem',
      add: (t, c) => { calls.push(`add:${t}:${c}`); return 'ok'; },
      replace: (t) => { calls.push(`replace:${t}`); return 'ok'; },
      remove: (t) => { calls.push(`remove:${t}`); return 'ok'; },
      read: () => '',
      clear: () => {},
      buildSystemPromptContribution: () => '[dreem]',
    };

    makeMemoryExtension(pi as any, baseConfig('dreem') as any, join(tmpDir, 'memories'), [alt]);
    const tool = getTool('memory');
    await callTool(tool, { action: 'add', target: 'memory', content: 'note' });

    expect(calls).toContain('add:memory:note');
  });

  it('writes to the builtin files by default', async () => {
    const { pi, getTool } = makeMockPi();
    const dir = join(tmpDir, 'memories');
    makeMemoryExtension(pi as any, baseConfig() as any, dir, []);
    const tool = getTool('memory');
    await callTool(tool, { action: 'add', target: 'memory', content: 'default note' });
    expect(readFileSync(join(dir, 'MEMORY.md'), 'utf-8')).toContain('default note');
  });
});
