import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync } from 'fs';

const WORKSPACE = mkdtempSync(join(tmpdir(), 'reeboot-events-'));

// Live subscriber stored by session.subscribe().
let subscriber: ((event: any) => void) | null = null;
function emit(event: any) {
  subscriber?.(event);
}
// Test-controlled completion of the mocked prompt.
let resolvePrompt: () => void = () => {};
let pendingPrompt: Promise<void> | null = null;

const createAgentSessionMock = vi.fn();
vi.mock('@earendil-works/pi-coding-agent', () => {
  function createMockSession() {
    return {
      bindExtensions: vi.fn(async () => {}),
      _extensionRunner: { emit: vi.fn() },
      subscribe: vi.fn((fn: any) => {
        subscriber = fn;
        return () => {};
      }),
      prompt: vi.fn(async () => {
        // Never resolves on its own; the test completes it after emitting events.
        pendingPrompt = new Promise<void>((res) => {
          resolvePrompt = res;
        });
        return pendingPrompt;
      }),
      abort: vi.fn(),
    };
  }
  return {
    createAgentSession: createAgentSessionMock.mockImplementation(() =>
      Promise.resolve({ session: createMockSession() })
    ),
    SessionManager: { inMemory: vi.fn(() => ({})), create: vi.fn(() => ({})), open: vi.fn(() => ({})) },
    SettingsManager: { inMemory: vi.fn(() => ({})), create: vi.fn(() => ({})) },
    ModelRuntime: {
      create: vi.fn(() => Promise.resolve({ setRuntimeApiKey: vi.fn() })),
    },
  };
});

const { PiAgentRunner } = await import('../../src/agent-runner/pi-runner.js');

function makeLoader() {
  return { reload: vi.fn().mockResolvedValue(undefined) } as any;
}

function makeRunner() {
  return new PiAgentRunner({ id: 't', workspacePath: WORKSPACE }, makeLoader(), {
    agent: { model: { authMode: 'own', provider: 'anthropic', id: 'claude-sonnet-4-5', apiKey: 'sk' } },
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  subscriber = null;
  pendingPrompt = null;
  resolvePrompt = () => {};
});

describe('pi-runner event mapping (events)', () => {
  it('maps message_update text_delta to text_delta RunnerEvents', async () => {
    const runner = makeRunner();
    const events: any[] = [];
    const done = runner.prompt('hi', (e) => events.push(e));
    // Let the session be created and subscribe() run.
    await new Promise(r => setTimeout(r, 10));
    emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hello' } });
    emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: ' world' } });
    emit({ type: 'agent_end', messages: [] });
    resolvePrompt();
    await done;

    const deltas = events.filter((e) => e.type === 'text_delta').map((e) => e.delta);
    expect(deltas).toEqual(['Hello', ' world']);
  });

  it('maps tool_execution_start/end to tool RunnerEvents', async () => {
    const runner = makeRunner();
    const events: any[] = [];
    const done = runner.prompt('hi', (e) => events.push(e));
    await new Promise(r => setTimeout(r, 10));
    emit({ type: 'tool_execution_start', toolCallId: 'c1', toolName: 'read', args: { path: 'x' } });
    emit({ type: 'tool_execution_end', toolCallId: 'c1', toolName: 'read', result: { content: [] }, isError: false });
    emit({ type: 'agent_end', messages: [] });
    resolvePrompt();
    await done;

    const start = events.find((e) => e.type === 'tool_call_start');
    expect(start).toMatchObject({ toolCallId: 'c1', toolName: 'read', args: { path: 'x' } });
    const end = events.find((e) => e.type === 'tool_call_end');
    expect(end).toMatchObject({ toolCallId: 'c1', toolName: 'read', isError: false });
  });

  it('attaches the real tool args to the tool_call_end event (not {})', async () => {
    const runner = makeRunner();
    const events: any[] = [];
    const done = runner.prompt('hi', (e) => events.push(e));
    await new Promise(r => setTimeout(r, 10));
    // pi's tool_execution_end event carries no args; the args come from start.
    emit({ type: 'tool_execution_start', toolCallId: 'c1', toolName: 'read', args: { path: 'x' } });
    emit({ type: 'tool_execution_end', toolCallId: 'c1', toolName: 'read', result: 'ok', isError: false });
    emit({ type: 'agent_end', messages: [] });
    resolvePrompt();
    await done;

    const end = events.find((e) => e.type === 'tool_call_end');
    expect(end?.input).toEqual({ path: 'x' });
    expect(end?.tool_input).toEqual({ path: 'x' });
    expect(end?.tool_output).toBe('ok');
  });

  it('maps agent_end to a message_end RunnerEvent with a runId', async () => {
    const runner = makeRunner();
    const events: any[] = [];
    const done = runner.prompt('hi', (e) => events.push(e));
    await new Promise(r => setTimeout(r, 10));
    emit({ type: 'agent_end', messages: [] });
    resolvePrompt();
    await done;

    const end = events.find((e) => e.type === 'message_end');
    expect(end).toBeDefined();
    expect(typeof end.runId).toBe('string');
  });
});
