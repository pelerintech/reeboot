import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  makeMemoryExtension,
  builtinMemoryProvider,
  initMemoryFiles,
} from '../../src/extensions/memory-manager.js';
import type { MemoryProvider, MemoryFilePaths } from '../../src/extensions/memory-manager.js';

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

function makeBuiltin(paths: MemoryFilePaths): MemoryProvider {
  return builtinMemoryProvider(paths, { memory: 2200, user: 1375 });
}

describe('builtin memory provider — new contract', () => {
  it('store (default) writes hot memory and returns an opaque ref', async () => {
    const dir = join(tmpDir, 'memories');
    initMemoryFiles(dir);
    const provider = makeBuiltin({
      memoryPath: join(dir, 'MEMORY.md'),
      userPath: join(dir, 'USER.md'),
    });

    // Everything-is-hot-first: a default store lands in hot (working) memory.
    const ref = await provider.store('self', 'hello world');
    expect(typeof ref.id).toBe('string');
    expect(ref.id.length).toBeGreaterThan(0);
    expect(readFileSync(join(dir, 'hot-memory.md'), 'utf-8')).toContain('hello world');
  });

  it('store (consolidation source) writes cold MEMORY.md and returns an opaque ref', async () => {
    const dir = join(tmpDir, 'memories');
    initMemoryFiles(dir);
    const provider = makeBuiltin({
      memoryPath: join(dir, 'MEMORY.md'),
      userPath: join(dir, 'USER.md'),
    });

    const ref = await provider.store('self', 'long-term note', { source: 'consolidation' });
    expect(typeof ref.id).toBe('string');
    expect(readFileSync(join(dir, 'MEMORY.md'), 'utf-8')).toContain('long-term note');
  });

  it('update consumes the ref to replace the entry', async () => {
    const dir = join(tmpDir, 'memories');
    initMemoryFiles(dir);
    const provider = makeBuiltin({
      memoryPath: join(dir, 'MEMORY.md'),
      userPath: join(dir, 'USER.md'),
    });

    const ref = await provider.store('self', 'original', { source: 'consolidation' });
    await provider.update('self', ref, 'updated entry');
    const content = readFileSync(join(dir, 'MEMORY.md'), 'utf-8');
    expect(content).toContain('updated entry');
    expect(content).not.toContain('original');
  });

  it('forget consumes the ref to remove the entry', async () => {
    const dir = join(tmpDir, 'memories');
    initMemoryFiles(dir);
    const provider = makeBuiltin({
      memoryPath: join(dir, 'MEMORY.md'),
      userPath: join(dir, 'USER.md'),
    });

    const ref = await provider.store('human', 'to remove', { source: 'consolidation' });
    await provider.forget('human', ref);
    expect(readFileSync(join(dir, 'USER.md'), 'utf-8')).not.toContain('to remove');
  });

  it('recall is query-based term matching and never a full dump', async () => {
    const dir = join(tmpDir, 'memories');
    initMemoryFiles(dir);
    const provider = makeBuiltin({
      memoryPath: join(dir, 'MEMORY.md'),
      userPath: join(dir, 'USER.md'),
    });

    await provider.store('self', 'the cat sleeps all day', { source: 'consolidation' });
    await provider.store('self', 'dogs love long walks', { source: 'consolidation' });

    const hits = await provider.recall('self', 'cat', 5);
    expect(hits.some((h) => h.content.includes('cat'))).toBe(true);
    expect(hits.every((h) => !h.content.includes('dogs'))).toBe(true);
  });

  it("'both' concatenates recall across self + human", async () => {
    const dir = join(tmpDir, 'memories');
    initMemoryFiles(dir);
    const provider = makeBuiltin({
      memoryPath: join(dir, 'MEMORY.md'),
      userPath: join(dir, 'USER.md'),
    });

    await provider.store('self', 'cat in memory notes', { source: 'consolidation' });
    await provider.store('human', 'cat in user profile', { source: 'consolidation' });

    const hits = await provider.recall('both', 'cat', 10);
    const scopes = hits.map((h) => h.scope).sort();
    expect(scopes).toContain('self');
    expect(scopes).toContain('human');
  });

  it('clear wipes a scope file', async () => {
    const dir = join(tmpDir, 'memories');
    initMemoryFiles(dir);
    const provider = makeBuiltin({
      memoryPath: join(dir, 'MEMORY.md'),
      userPath: join(dir, 'USER.md'),
    });

    await provider.store('self', 'ephemeral note', { source: 'consolidation' });
    await provider.clear('self');
    expect(readFileSync(join(dir, 'MEMORY.md'), 'utf-8')).not.toContain('ephemeral note');
  });

  it('grounding returns the memory block trimmed to maxChars', async () => {
    const dir = join(tmpDir, 'memories');
    initMemoryFiles(dir);
    const provider = makeBuiltin({
      memoryPath: join(dir, 'MEMORY.md'),
      userPath: join(dir, 'USER.md'),
    });

    await provider.store('self', 'user prefers concise bullet summaries. '.repeat(10), { source: 'consolidation' });
    const block = await provider.grounding({ maxChars: 100 });
    expect(block.length).toBeLessThanOrEqual(150); // header + trimmed content
    expect(block.length).toBeGreaterThan(0);
  });
});

describe('memory tool routed through the active provider', () => {
  it('routes add to a configured alternate provider', async () => {
    const { pi, getTool } = makeMockPi();
    const calls: string[] = [];
    const alt: MemoryProvider = {
      id: 'dreem',
      async store(scope, content) { calls.push(`store:${scope}:${content}`); return { id: 'r' }; },
      async update() {},
      async forget() {},
      async recall() { return []; },
      async clear() {},
      async grounding() { return '[dreem]'; },
      listCapabilities() { return []; },
    };

    makeMemoryExtension(pi as any, baseConfig('dreem') as any, join(tmpDir, 'memories'), [alt]);
    const tool = getTool('memory');
    await callTool(tool, { action: 'add', target: 'memory', content: 'note' });

    expect(calls).toContain('store:self:note');
  });

  it('writes to builtin hot memory by default', async () => {
    const { pi, getTool } = makeMockPi();
    const dir = join(tmpDir, 'memories');
    makeMemoryExtension(pi as any, baseConfig() as any, dir, []);
    const tool = getTool('memory');
    await callTool(tool, { action: 'add', target: 'memory', content: 'default note' });
    expect(readFileSync(join(dir, 'hot-memory.md'), 'utf-8')).toContain('default note');
  });

  it('falls back to builtin when a valid-but-unregistered provider is configured (S3)', async () => {
    const { pi, getTool } = makeMockPi();
    const dir = join(tmpDir, 'memories');
    makeMemoryExtension(pi as any, baseConfig('mem0') as any, dir, []);
    const tool = getTool('memory');
    expect(tool).toBeDefined();
    await callTool(tool, { action: 'add', target: 'memory', content: 'fallback note' });
    expect(readFileSync(join(dir, 'hot-memory.md'), 'utf-8')).toContain('fallback note');
  });
});
