/**
 * Tests for authMode isolation in PiAgentRunner._getOrCreateSession()
 *
 * These tests verify that:
 * - authMode="own" builds session with inMemory settings + injected API key
 * - authMode="pi" builds session with pi's own settings + auth files
 * - agentDir (for persona) is always ~/.reeboot/agent/ regardless of authMode
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { join } from 'path';
import { homedir } from 'os';

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('PiAgentRunner authMode="own"', () => {
  it('uses inMemory settingsManager with provider+model from config', async () => {
    let capturedOptions: any = null;

    vi.doMock('@mariozechner/pi-coding-agent', async () => {
      const actual = await vi.importActual<any>('@mariozechner/pi-coding-agent');
      return {
        ...actual,
        createAgentSession: vi.fn(async (opts: any) => {
          capturedOptions = opts;
          return { session: { subscribe: vi.fn(() => vi.fn()), prompt: vi.fn(), abort: vi.fn() } };
        }),
        SessionManager: { inMemory: vi.fn(() => ({})) },
      };
    });

    const { createLoader } = await import('@src/extensions/loader.js');
    const config = {
      agent: { model: { authMode: 'own', provider: 'minimax', id: 'MiniMax-M1', apiKey: 'mm-key-xyz' } },
      extensions: { core: {} },
    } as any;
    const loader = createLoader({ id: 'main', workspacePath: '/tmp' }, config);

    const { PiAgentRunner } = await import('@src/agent-runner/pi-runner.js');
    const runner = new PiAgentRunner({ id: 'main', workspacePath: '/tmp' }, loader, config);

    // Trigger session creation
    runner.prompt('test', () => {}).catch(() => {});
    await new Promise(r => setTimeout(r, 500));

    expect(capturedOptions).not.toBeNull();
    const sm = capturedOptions?.settingsManager;
    expect(sm?.getDefaultProvider()).toBe('minimax');
    expect(sm?.getDefaultModel()).toBe('MiniMax-M1');

    // authStorage should have minimax key
    const auth = capturedOptions?.authStorage;
    expect(auth?.hasAuth('minimax')).toBe(true);
  });

  it('falls back to env var when config apiKey is empty', async () => {
    let capturedOptions: any = null;

    vi.doMock('@mariozechner/pi-coding-agent', async () => {
      const actual = await vi.importActual<any>('@mariozechner/pi-coding-agent');
      return {
        ...actual,
        createAgentSession: vi.fn(async (opts: any) => {
          capturedOptions = opts;
          return { session: { subscribe: vi.fn(() => vi.fn()), prompt: vi.fn(), abort: vi.fn() } };
        }),
        SessionManager: { inMemory: vi.fn(() => ({})) },
      };
    });

    process.env.OPENAI_API_KEY = 'sk-env-test-key';

    const { createLoader } = await import('@src/extensions/loader.js');
    const config = {
      agent: { model: { authMode: 'own', provider: 'openai', id: 'gpt-4o', apiKey: '' } },
      extensions: { core: {} },
    } as any;
    const loader = createLoader({ id: 'main', workspacePath: '/tmp' }, config);

    const { PiAgentRunner } = await import('@src/agent-runner/pi-runner.js');
    const runner = new PiAgentRunner({ id: 'main', workspacePath: '/tmp' }, loader, config);

    runner.prompt('test', () => {}).catch(() => {});
    await new Promise(r => setTimeout(r, 500));

    delete process.env.OPENAI_API_KEY;

    const auth = capturedOptions?.authStorage;
    expect(auth?.hasAuth('openai')).toBe(true);
  });
});

describe('PiAgentRunner authMode="pi"', () => {
  it('uses pi agentDir for settings and auth', async () => {
    let capturedOptions: any = null;

    vi.doMock('@mariozechner/pi-coding-agent', async () => {
      const actual = await vi.importActual<any>('@mariozechner/pi-coding-agent');
      return {
        ...actual,
        createAgentSession: vi.fn(async (opts: any) => {
          capturedOptions = opts;
          return { session: { subscribe: vi.fn(() => vi.fn()), prompt: vi.fn(), abort: vi.fn() } };
        }),
        SessionManager: { inMemory: vi.fn(() => ({})) },
      };
    });

    const { createLoader } = await import('@src/extensions/loader.js');
    const config = {
      agent: { model: { authMode: 'pi', provider: '', id: '', apiKey: '' } },
      extensions: { core: {} },
    } as any;
    const loader = createLoader({ id: 'main', workspacePath: '/tmp' }, config);

    const { PiAgentRunner } = await import('@src/agent-runner/pi-runner.js');
    const runner = new PiAgentRunner({ id: 'main', workspacePath: '/tmp' }, loader, config);

    runner.prompt('test', () => {}).catch(() => {});
    await new Promise(r => setTimeout(r, 500));

    expect(capturedOptions).not.toBeNull();

    // For authMode="pi": explicit settingsManager+authStorage from pi's files,
    // no agentDir passed (avoids loading pi's personal extensions into reeboot)
    expect(capturedOptions?.agentDir).toBeUndefined();
    expect(capturedOptions?.settingsManager).toBeDefined();
    expect(capturedOptions?.authStorage).toBeDefined();

    // resourceLoader is still reeboot's (persona from ~/.reeboot/agent/)
    expect((loader as any).agentDir).toMatch(/\.reeboot[/\\]agent$/);
  });
});
