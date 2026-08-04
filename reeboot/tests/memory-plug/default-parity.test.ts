import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, rmSync } from 'fs';
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
  it('memory tool writes the same MEMORY.md/USER.md entries as before', async () => {
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

    const memoryContent = readFileSync(join(dir, 'MEMORY.md'), 'utf-8');
    const userContent = readFileSync(join(dir, 'USER.md'), 'utf-8');

    // Byte-for-byte identical to the old helper output.
    expect(memoryContent).toBe(MEMORY_HEADER + 'prefers concise answers\n');
    expect(userContent).toBe(USER_HEADER + 'Owner names: Sam\n');

    // replace + remove still reach the same file state
    await callTool(tool, { action: 'replace', target: 'memory', old_text: 'concise', content: 'prefers terse answers' });
    expect(readFileSync(join(dir, 'MEMORY.md'), 'utf-8')).toBe(MEMORY_HEADER + 'prefers terse answers\n');
    await callTool(tool, { action: 'remove', target: 'user', old_text: 'Owner' });
    expect(readFileSync(join(dir, 'USER.md'), 'utf-8')).toBe(USER_HEADER);
  });

  it('before_agent_start grounding reproduces the old system-prompt block', async () => {
    const { pi, fireBeforeAgentStart, getTool } = makeMockPi();
    const dir = join(tmpDir, 'memories');
    initMemoryFiles(dir);
    const memoryPath = join(dir, 'MEMORY.md');
    const userPath = join(dir, 'USER.md');
    // Write known content via the extension tool to keep state consistent
    makeMemoryExtension(pi as any, {
      memory: {
        enabled: true,
        memoryCharLimit: 2200,
        userCharLimit: 1375,
        consolidation: { enabled: false },
      },
    } as any, dir, []);
    const tool = getTool('memory');
    await callTool(tool, { action: 'add', target: 'memory', content: 'system prompt note' });
    await callTool(tool, { action: 'add', target: 'user', content: 'User from Paris' });

    const memContent = readFileSync(memoryPath, 'utf-8');
    const userContent = readFileSync(userPath, 'utf-8');
    const expected = buildMemoryBlock(memContent, userContent, 2200, 1375);

    const prompt = await fireBeforeAgentStart();
    expect(prompt).toBe(expected);
  });
});
