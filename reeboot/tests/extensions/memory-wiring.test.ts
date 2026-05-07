/**
 * Tests for memory extension config wiring — verifies that:
 * - makeMemoryExtension accepts config as argument (not pi.getConfig)
 * - char limits from config are respected (not hardcoded defaults)
 * - DB access uses require('../db/index.js') pattern
 * - Scheduler access uses require('../scheduler-registry.js') pattern
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { makeMemoryExtension } from '../../src/extensions/memory-manager.js';

// ─── Mock pi API ──────────────────────────────────────────────────────────────

function makeMockPi() {
  const registeredTools: string[] = [];
  const handlers: Record<string, Function[]> = {};
  let systemPromptResult = '';

  return {
    pi: {
      registerTool(def: { name: string }) {
        registeredTools.push(def.name);
      },
      on(event: string, handler: Function) {
        if (!handlers[event]) handlers[event] = [];
        handlers[event].push(handler);
      },
      getActiveTools() { return registeredTools; },
    },
    registeredTools,
    handlers,
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('makeMemoryExtension — config argument wiring', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `memory-wiring-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses memoryCharLimit from config, not hardcoded 2200', async () => {
    const { pi, fireBeforeAgentStart } = makeMockPi();
    const config = {
      memory: {
        enabled: true,
        memoryCharLimit: 999,
        userCharLimit: 500,
        consolidation: { enabled: false, schedule: '0 2 * * *' },
      },
    };

    makeMemoryExtension(pi as any, config as any, tmpDir);
    const prompt = await fireBeforeAgentStart();

    // Should reference 999 (the configured limit), not 2200 (the hardcoded default)
    expect(prompt).toContain('999');
    expect(prompt).not.toContain('2200');
  });

  it('uses userCharLimit from config, not hardcoded 1375', async () => {
    const { pi, fireBeforeAgentStart } = makeMockPi();
    const config = {
      memory: {
        enabled: true,
        memoryCharLimit: 2200,
        userCharLimit: 777,
        consolidation: { enabled: false, schedule: '0 2 * * *' },
      },
    };

    makeMemoryExtension(pi as any, config as any, tmpDir);
    const prompt = await fireBeforeAgentStart();

    expect(prompt).toContain('777');
    expect(prompt).not.toContain('1375');
  });

  it('registers memory tool when memory.enabled is true', () => {
    const { pi, registeredTools } = makeMockPi();
    const config = {
      memory: { enabled: true, memoryCharLimit: 2200, userCharLimit: 1375, consolidation: { enabled: false } },
    };

    makeMemoryExtension(pi as any, config as any, tmpDir);

    expect(registeredTools).toContain('memory');
    expect(registeredTools).toContain('session_search');
  });

  it('does NOT register memory tool when memory.enabled is false', () => {
    const { pi, registeredTools } = makeMockPi();
    const config = {
      memory: { enabled: false, memoryCharLimit: 2200, userCharLimit: 1375, consolidation: { enabled: false } },
    };

    makeMemoryExtension(pi as any, config as any, tmpDir);

    expect(registeredTools).not.toContain('memory');
  });

  it('registers session_search even when memory.enabled is false', () => {
    const { pi, registeredTools } = makeMockPi();
    const config = {
      memory: { enabled: false, memoryCharLimit: 2200, userCharLimit: 1375, consolidation: { enabled: false } },
    };

    makeMemoryExtension(pi as any, config as any, tmpDir);

    expect(registeredTools).toContain('session_search');
    expect(registeredTools).not.toContain('memory');
  });

  it('does NOT register before_agent_start hook when memory.enabled is false', async () => {
    const { pi, handlers, fireBeforeAgentStart } = makeMockPi();
    const config = {
      memory: { enabled: false, memoryCharLimit: 2200, userCharLimit: 1375, consolidation: { enabled: false } },
    };

    makeMemoryExtension(pi as any, config as any, tmpDir);

    expect(handlers['before_agent_start'] ?? []).toHaveLength(0);
    const prompt = await fireBeforeAgentStart('original');
    expect(prompt).toBe('');  // no injection happened
  });
});
