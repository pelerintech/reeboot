import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  makeMemoryExtension,
  buildMemoryBlock,
  initMemoryFiles,
} from '../../src/extensions/memory-manager.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `default-parity-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
});

afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function makeMockPi() {
  const tools = new Map<string, any>();
  const handlers: Record<string, Function[]> = {};
  return {
    pi: {
      registerTool(def: any) {
        tools.set(def.name, def);
      },
      on(event: string, handler: Function) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      },
    },
    getTool(name: string) {
      return tools.get(name);
    },
    async fireBeforeAgentStart(existing = '') {
      let out = existing;
      const hs = handlers['before_agent_start'] ?? [];
      for (const h of hs) {
        const r = await h({ systemPrompt: existing });
        if (r?.systemPrompt) out = r.systemPrompt;
      }
      return out;
    },
  };
}

async function callTool(tool: any, params: any) {
  const res = await tool.execute('id', params);
  if (Array.isArray(res?.content)) return res.content.map((c: any) => c.text).join('');
  return String(res);
}

// The OLD source-of-truth calculation for the memory file headers and the
// system-prompt block. The reshaped default must reproduce these byte-for-byte.
const MEMORY_HEADER = '# MEMORY\n\n';
const USER_HEADER = '# USER PROFILE\n\n';

describe('default builtin behaviour preserved (regression)', () => {
  it('memory tool writes hot first (Option B); cold only via consolidation', async () => {
    const { pi, getTool } = makeMockPi();
    const dir = join(tmpDir, 'memories');
    makeMemoryExtension(pi as any, {
      memory: {
        enabled: true,
        memoryCharLimit: 2200,
        userCharLimit: 1375,
        consolidation: { enabled: false },
      },
    } as any, dir, []);

    const tool = getTool('memory');
    await callTool(tool, { action: 'add', target: 'memory', content: 'prefers concise answers' });
    await callTool(tool, { action: 'add', target: 'user', content: 'Owner names: Sam' });

    // Hot first: `add` writes to hot-memory.md, NOT to MEMORY.md/USER.md.
    const hotContent = readFileSync(join(dir, 'hot-memory.md'), 'utf-8');
    expect(hotContent).toContain('prefers concise answers');
    expect(hotContent).toContain('Owner names: Sam');
    // Cold files remain header-only until consolidation promotes an entry.
    expect(readFileSync(join(dir, 'MEMORY.md'), 'utf-8')).toBe(MEMORY_HEADER);
    expect(readFileSync(join(dir, 'USER.md'), 'utf-8')).toBe(USER_HEADER);

    // replace + remove still reach COLD entries (e.g. after consolidation
    // promotes an entry into MEMORY.md). Seed a cold entry and edit it via the tool.
    writeFileSync(join(dir, 'MEMORY.md'), MEMORY_HEADER + 'prefers concise answers\n', 'utf-8');
    await callTool(tool, { action: 'replace', target: 'memory', old_text: 'concise', content: 'prefers terse answers' });
    expect(readFileSync(join(dir, 'MEMORY.md'), 'utf-8')).toBe(MEMORY_HEADER + 'prefers terse answers\n');
    writeFileSync(join(dir, 'USER.md'), USER_HEADER + 'Owner names: Sam\n', 'utf-8');
    await callTool(tool, { action: 'remove', target: 'user', old_text: 'Owner' });
    expect(readFileSync(join(dir, 'USER.md'), 'utf-8')).toBe(USER_HEADER);
  });

  it('before_agent_start grounding surfaces hot-then-cold', async () => {
    const { pi, fireBeforeAgentStart, getTool } = makeMockPi();
    const dir = join(tmpDir, 'memories');
    initMemoryFiles(dir);
    const memoryPath = join(dir, 'MEMORY.md');
    const userPath = join(dir, 'USER.md');
    // Seed cold content directly; `add` lands in hot memory.
    writeFileSync(memoryPath, MEMORY_HEADER + 'system prompt note\n', 'utf-8');
    writeFileSync(userPath, USER_HEADER + 'User from Paris\n', 'utf-8');
    makeMemoryExtension(pi as any, {
      memory: {
        enabled: true,
        memoryCharLimit: 2200,
        userCharLimit: 1375,
        consolidation: { enabled: false },
      },
    } as any, dir, []);
    const tool = getTool('memory');
    await callTool(tool, { action: 'add', target: 'memory', content: 'hot entry note' });
    await callTool(tool, { action: 'add', target: 'user', content: 'hot user entry' });

    const memContent = readFileSync(memoryPath, 'utf-8');
    const userContent = readFileSync(userPath, 'utf-8');
    const coldBlock = buildMemoryBlock(memContent, userContent, 2200, 1375);
    const hotContent = readFileSync(join(dir, 'hot-memory.md'), 'utf-8');
    const hotBlock = hotContent.trim()
      ? '\n' + ['[HOT MEMORY]', 'Below are brief summaries of your last few sessions.', '', hotContent.trim()].join('\n') + '\n'
      : '';
    // Provider-owned digest surfaces hot-then-cold in the same block.
    const expected = hotBlock + coldBlock;

    const prompt = await fireBeforeAgentStart();
    expect(prompt).toBe(expected);
    const hotIdx = prompt.indexOf('[HOT MEMORY]');
    const coldIdx = prompt.indexOf('MEMORY (your personal notes)');
    expect(hotIdx).toBeGreaterThan(-1);
    expect(coldIdx).toBeGreaterThan(hotIdx);
  });
});
