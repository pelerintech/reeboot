import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir, homedir } from 'os';
import { join } from 'path';
import { mkdtempSync } from 'fs';

const WORKSPACE = mkdtempSync(join(tmpdir(), 'reeboot-authmodel-'));

// ── spies captured across the module mock ────────────────────────────────────
const createAgentSessionMock = vi.fn();
const sessionManagerInMemory = vi.fn();
const settingsManagerInMemory = vi.fn();
const settingsManagerCreate = vi.fn();
const modelRuntimeCreate = vi.fn();
const setRuntimeApiKey = vi.fn();

vi.mock('@earendil-works/pi-coding-agent', () => {
  function createMockSession() {
    let subscriber: ((event: any) => void) | null = null;
    return {
      bindExtensions: vi.fn(async () => {}),
      _extensionRunner: { emit: vi.fn() },
      subscribe: vi.fn((fn: any) => {
        subscriber = fn;
        Promise.resolve().then(() => subscriber?.({ type: 'agent_end', messages: [] }));
        return () => {};
      }),
      prompt: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
  }
  return {
    createAgentSession: createAgentSessionMock.mockImplementation(() =>
      Promise.resolve({ session: createMockSession() })
    ),
    SessionManager: {
      inMemory: sessionManagerInMemory.mockReturnValue({}),
      create: vi.fn(() => ({})),
      open: vi.fn(() => ({})),
    },
    SettingsManager: {
      inMemory: settingsManagerInMemory.mockReturnValue({}),
      create: settingsManagerCreate.mockReturnValue({}),
    },
    ModelRuntime: {
      create: modelRuntimeCreate.mockImplementation(() =>
        Promise.resolve({ setRuntimeApiKey: setRuntimeApiKey.mockResolvedValue(undefined) })
      ),
    },
  };
});

const { PiAgentRunner } = await import('../../src/agent-runner/pi-runner.js');

function makeLoader() {
  return {
    reload: vi.fn().mockResolvedValue(undefined),
    getExtensions: vi.fn(),
    getSkills: vi.fn(),
  } as any;
}

function makeConfig(model: any) {
  return { agent: { model } } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pi-runner own-mode model construction (authModel)', () => {
  it("passes a resolved `model` to createAgentSession and drops authStorage/modelRegistry", async () => {
    const runner = new PiAgentRunner(
      { id: 'test', workspacePath: WORKSPACE },
      makeLoader(),
      makeConfig({ authMode: 'own', provider: 'anthropic', id: 'claude-sonnet-4-5', apiKey: 'sk-test' }),
    );

    await runner.prompt('hi', () => {});

    expect(createAgentSessionMock).toHaveBeenCalledTimes(1);
    const opts = createAgentSessionMock.mock.calls[0][0];

    // The new surface: `model` is present, old internals are gone.
    expect(opts).toHaveProperty('model');
    expect(opts).not.toHaveProperty('authStorage');
    expect(opts).not.toHaveProperty('modelRegistry');

    // Retained wiring is still passed through.
    expect(opts.cwd).toBe(WORKSPACE);
    expect(opts.resourceLoader).toBeDefined();
    expect(opts.sessionManager).toBeDefined();
    expect(opts.settingsManager).toBeDefined();

    // The resolved model from reeboot's config.
    expect(opts.model.provider).toBe('anthropic');
    expect(opts.model.id).toBe('claude-sonnet-4-5');
  });

  it('resolves config apiKey first and applies it to the model runtime key', async () => {
    const runner = new PiAgentRunner(
      { id: 'test', workspacePath: WORKSPACE },
      makeLoader(),
      makeConfig({ authMode: 'own', provider: 'anthropic', id: 'claude-sonnet-4-5', apiKey: 'sk-config' }),
    );

    process.env.ANTHROPIC_API_KEY = 'sk-env';
    await runner.prompt('hi', () => {});
    delete process.env.ANTHROPIC_API_KEY;

    // config apiKey wins over the env var
    expect(setRuntimeApiKey).toHaveBeenCalledWith('anthropic', 'sk-config');
    expect(setRuntimeApiKey).not.toHaveBeenCalledWith('anthropic', 'sk-env');
  });

  it('falls back to the provider env var when config apiKey is empty', async () => {
    const runner = new PiAgentRunner(
      { id: 'test', workspacePath: WORKSPACE },
      makeLoader(),
      makeConfig({ authMode: 'own', provider: 'openai', id: 'gpt-4o', apiKey: '' }),
    );

    process.env.OPENAI_API_KEY = 'sk-env';
    await runner.prompt('hi', () => {});
    delete process.env.OPENAI_API_KEY;

    expect(setRuntimeApiKey).toHaveBeenCalledWith('openai', 'sk-env');
  });

  it('pi mode passes agentDir under ~/.pi/agent with no auth internals or SettingsManager.create', async () => {
    const runner = new PiAgentRunner(
      { id: 'test', workspacePath: WORKSPACE },
      makeLoader(),
      makeConfig({ authMode: 'pi', provider: '', id: '', apiKey: '' }),
    );

    await runner.prompt('hi', () => {});

    const opts = createAgentSessionMock.mock.calls[0][0];
    expect(opts.agentDir).toBe(join(homedir(), '.pi', 'agent'));
    expect(opts).not.toHaveProperty('authStorage');
    expect(opts).not.toHaveProperty('modelRegistry');
    expect(opts).not.toHaveProperty('settingsManager');
    // SettingsManager.create must not be invoked in pi mode
    expect(settingsManagerCreate).not.toHaveBeenCalled();
  });
});
