import { describe, it, expect, vi } from 'vitest';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeMockRunner() {
  let capturedContent: string | undefined;

  const mockSession = {
    subscribe: vi.fn(() => () => {}),
    prompt: vi.fn(async (content: string) => {
      capturedContent = content;
    }),
    abort: vi.fn(),
  };

  const mockLoader = {
    reload: vi.fn(async () => {}),
    getExtensions: vi.fn(async () => []),
    getSkills: vi.fn(async () => []),
  };

  return { capturedContent: () => capturedContent, mockSession, mockLoader };
}

// ─── Task 7: Skill trust boundary ────────────────────────────────────────────

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeTrustTestEnv() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-skill-trust-'));
  const userCatalogDir = join(tmpDir, 'user-catalog');
  mkdirSync(join(userCatalogDir, 'myskill'), { recursive: true });
  writeFileSync(join(userCatalogDir, 'myskill', 'SKILL.md'), [
    '---',
    'name: myskill',
    'description: My user skill',
    '---',
    '# My skill instructions',
  ].join('\n'));
  const persistPath = join(tmpDir, 'active-skills.json');
  return { tmpDir, userCatalogDir, persistPath };
}

async function makeSkillManagerPi(config: any, persistPath: string) {
  const { skillManagerExtension } = await import('../extensions/skill-manager.js');
  const handlers: Record<string, Function[]> = {};
  const mockPi: any = {
    on: vi.fn((event: string, handler: Function) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    registerTool: vi.fn(),
    _handlers: handlers,
  };
  skillManagerExtension(mockPi, config, persistPath);
  const loadTool = (mockPi.registerTool as any).mock.calls.find(
    (c: any[]) => c[0].name === 'load_skill'
  )?.[0];
  return { mockPi, loadTool, handlers };
}

describe('skill-manager trust boundary', () => {
  it('user-installed skill gets [USER-INSTALLED SKILL — LOWER TRUST] marker', async () => {
    const { tmpDir, userCatalogDir, persistPath } = makeTrustTestEnv();
    try {
      const config = {
        skills: { catalog_path: userCatalogDir, ephemeral_ttl_minutes: 60, permanent: [] },
      } as any;
      const { loadTool, handlers } = await makeSkillManagerPi(config, persistPath);

      await loadTool.execute('id1', { name: 'myskill' }, null, null, {});

      const baHandler = handlers['before_agent_start']?.[0];
      const result = await baHandler({ systemPrompt: 'base' });
      expect(result?.systemPrompt).toContain('[USER-INSTALLED SKILL — LOWER TRUST]');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('bundled skill does NOT get [USER-INSTALLED SKILL — LOWER TRUST] marker', async () => {
    const { tmpDir, userCatalogDir, persistPath } = makeTrustTestEnv();
    try {
      // No user catalog — only bundled skills accessible
      const config = {
        skills: { catalog_path: userCatalogDir, ephemeral_ttl_minutes: 60, permanent: [] },
      } as any;
      const { loadTool, handlers } = await makeSkillManagerPi(config, persistPath);

      // 'github' exists in the bundled BUNDLED_SKILLS_DIR
      await loadTool.execute('id1', { name: 'github' }, null, null, {});

      const baHandler = handlers['before_agent_start']?.[0];
      const result = await baHandler({ systemPrompt: 'base' });
      // For bundled skill, no trust marker should be present
      expect(result?.systemPrompt ?? '').not.toContain('[USER-INSTALLED SKILL — LOWER TRUST]');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── Task 4 & 5: Injection-guard extension ───────────────────────────────────

describe('injection-guard extension', () => {
  async function makeInjectionGuard(config: any) {
    const mod = await import('@src/extensions/injection-guard.js');
    let registeredHook: ((event: any) => Promise<any>) | undefined;
    const mockPi = {
      on: vi.fn((event: string, handler: any) => {
        if (event === 'before_agent_start') registeredHook = handler;
      }),
    };
    mod.default(mockPi as any, config);
    return { registeredHook: registeredHook! };
  }

  it('injects external_content_policy when enabled with tools list', async () => {
    const config = {
      security: {
        injection_guard: {
          enabled: true,
          external_source_tools: ['fetch_url', 'gmail_read'],
        },
      },
    };
    const { registeredHook } = await makeInjectionGuard(config);
    const result = await registeredHook({ systemPrompt: 'base prompt' });
    expect(result?.systemPrompt).toContain('<external_content_policy>');
    expect(result?.systemPrompt).toContain('fetch_url');
    expect(result?.systemPrompt).toContain('gmail_read');
  });

  it('returns unchanged prompt when enabled = false', async () => {
    const config = {
      security: {
        injection_guard: {
          enabled: false,
          external_source_tools: ['fetch_url'],
        },
      },
    };
    const { registeredHook } = await makeInjectionGuard(config);
    const result = await registeredHook({ systemPrompt: 'base prompt' });
    expect(result).toBeUndefined();
  });

  it('returns unchanged prompt when external_source_tools is empty', async () => {
    const config = {
      security: {
        injection_guard: {
          enabled: true,
          external_source_tools: [],
        },
      },
    };
    const { registeredHook } = await makeInjectionGuard(config);
    const result = await registeredHook({ systemPrompt: 'base prompt' });
    expect(result).toBeUndefined();
  });
});

// ─── Task 2 & 3: End-user message wrapping ───────────────────────────────────

describe('PiAgentRunner message wrapping', () => {
  it('wraps content with trust notice when trust = end-user', async () => {
    const { PiAgentRunner } = await import('@src/agent-runner/pi-runner.js');
    const { capturedContent, mockSession, mockLoader } = makeMockRunner();

    const runner = new PiAgentRunner(
      { id: 'main', workspacePath: '/tmp/test' },
      mockLoader as any,
    );
    (runner as any)._session = mockSession;

    runner.prompt('hello world', () => {}, { trust: 'end-user' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 10));

    expect(capturedContent()).toBeDefined();
    expect(capturedContent()!.startsWith('[UNTRUSTED END-USER MESSAGE]')).toBe(true);
    expect(capturedContent()!).toContain('hello world');
    expect(capturedContent()!).toContain('[END UNTRUSTED MESSAGE]');

    runner.abort();
  });

  it('does not wrap content when trust = owner', async () => {
    const { PiAgentRunner } = await import('@src/agent-runner/pi-runner.js');
    const { capturedContent, mockSession, mockLoader } = makeMockRunner();

    const runner = new PiAgentRunner(
      { id: 'main', workspacePath: '/tmp/test' },
      mockLoader as any,
    );
    (runner as any)._session = mockSession;

    runner.prompt('hello world', () => {}, { trust: 'owner' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 10));

    expect(capturedContent()).toBe('hello world');

    runner.abort();
  });

  it('does not wrap content when options is omitted', async () => {
    const { PiAgentRunner } = await import('@src/agent-runner/pi-runner.js');
    const { capturedContent, mockSession, mockLoader } = makeMockRunner();

    const runner = new PiAgentRunner(
      { id: 'main', workspacePath: '/tmp/test' },
      mockLoader as any,
    );
    (runner as any)._session = mockSession;

    runner.prompt('hello world', () => {}).catch(() => {});
    await new Promise((r) => setTimeout(r, 10));

    expect(capturedContent()).toBe('hello world');

    runner.abort();
  });
});
