/**
 * Tests for authMode isolation in PiAgentRunner._getOrCreateSession()
 *
 * Verifies that under the 0.84 pi SDK:
 * - authMode="own" builds a resolved `model` + a ModelRuntime bound to reeboot's
 *   creds (key via modelRuntime.setRuntimeApiKey); no authStorage/modelRegistry.
 * - authMode="pi" passes agentDir=~/.pi/agent and no longer constructs the auth
 *   internals (createAgentSession defaults them). */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';

const setRuntimeApiKey = vi.fn();
let capturedOptions: any = null;

vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: vi.fn(async (opts: any) => {
    capturedOptions = opts;
    return {
      session: {
        subscribe: vi.fn(() => vi.fn()),
        bindExtensions: vi.fn(async () => {}),
        prompt: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn(),
      },
    };
  }),
  SessionManager: {
    inMemory: vi.fn(() => ({})),
    create: vi.fn(() => ({})),
    open: vi.fn(() => ({})),
  },
  SettingsManager: {
    inMemory: vi.fn(() => ({})),
    create: vi.fn(() => ({})),
  },
  ModelRuntime: {
    create: vi.fn(() => Promise.resolve({ setRuntimeApiKey: setRuntimeApiKey.mockResolvedValue(undefined) })),
  },
}));

async function importRunner() {
  const { PiAgentRunner } = await import('@src/agent-runner/pi-runner.js');
  return PiAgentRunner;
}

function loader() {
  return {
    reload: vi.fn().mockResolvedValue(undefined),
    getExtensions: vi.fn().mockResolvedValue([]),
    getSkills: vi.fn().mockResolvedValue([]),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOptions = null;
});

describe('PiAgentRunner authMode="own"', () => {
  it('builds a resolved model + ModelRuntime key instead of authStorage/registry', async () => {
    const PiAgentRunner = await importRunner();
    const config = {
      agent: { model: { authMode: 'own', provider: 'minimax', id: 'MiniMax-M1', apiKey: 'mm-key-xyz' } },
    } as any;
    const runner = new PiAgentRunner({ id: 'main', workspacePath: '/tmp' }, loader(), config);

    runner.prompt('test', () => {}).catch(() => {});
    await new Promise((r) => setTimeout(r, 50));

    expect(capturedOptions).not.toBeNull();
    // new surface: no authStorage/registry, model + modelRuntime present
    expect(capturedOptions).not.toHaveProperty('authStorage');
    expect(capturedOptions).not.toHaveProperty('modelRegistry');
    expect(capturedOptions.model.provider).toBe('minimax');
    expect(capturedOptions.model.id).toBe('MiniMax-M1');
    expect(capturedOptions.modelRuntime).toBeDefined();
    // key applied through the runtime
    expect(setRuntimeApiKey).toHaveBeenCalledWith('minimax', 'mm-key-xyz');
  });

  it('falls back to env var when config apiKey is empty', async () => {
    process.env.OPENAI_API_KEY = 'sk-env-test-key';
    const PiAgentRunner = await importRunner();
    const config = {
      agent: { model: { authMode: 'own', provider: 'openai', id: 'gpt-4o', apiKey: '' } },
    } as any;
    const runner = new PiAgentRunner({ id: 'main', workspacePath: '/tmp' }, loader(), config);

    runner.prompt('test', () => {}).catch(() => {});
    await new Promise((r) => setTimeout(r, 50));

    delete process.env.OPENAI_API_KEY;
    expect(setRuntimeApiKey).toHaveBeenCalledWith('openai', 'sk-env-test-key');
  });
});

describe('PiAgentRunner authMode="pi"', () => {
  it('passes agentDir=~/.pi/agent and stops building auth config', async () => {
    const PiAgentRunner = await importRunner();
    const config = {
      agent: { model: { authMode: 'pi', provider: '', id: '', apiKey: '' } },
    } as any;
    const runner = new PiAgentRunner({ id: 'main', workspacePath: '/tmp' }, loader(), config);

    runner.prompt('test', () => {}).catch(() => {});
    await new Promise((r) => setTimeout(r, 50));

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions.agentDir).toBe(join(homedir(), '.pi', 'agent'));
    // no longer construct auth/registry/settings ourselves
    expect(capturedOptions).not.toHaveProperty('authStorage');
    expect(capturedOptions).not.toHaveProperty('modelRegistry');
    expect(capturedOptions).not.toHaveProperty('settingsManager');
    expect(capturedOptions).not.toHaveProperty('modelRuntime');
  });
});
