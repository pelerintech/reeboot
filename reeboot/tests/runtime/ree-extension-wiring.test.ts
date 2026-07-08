import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtensionContext, ContextConfig } from '@src/agent-runner/interface.js';

const mockContext: ExtensionContext = {
  cwd: '/tmp/test-workspace',
  workspacePath: '/tmp/test-workspace',
  config: { agent: { model: { provider: 'openai' } } },
  ui: {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify: () => {},
  },
  hasUI: false,
};

const mockConfig = { agent: { model: { provider: 'openai' } } };

const runnerContext: ContextConfig = {
  id: 'main',
  workspacePath: '/tmp/test-workspace',
};

// ─── Task 26: extension subset wired into the production path ────────────────

describe('Extension subset wiring — ReeRuntime.createChat initializes extensions', () => {
  let ReeRuntime: typeof import('@src/runtime/ree-runtime.js').ReeRuntime;

  beforeEach(async () => {
    const mod = await import('@src/runtime/ree-runtime.js');
    ReeRuntime = mod.ReeRuntime;
  });

  it('createChat runs factories against the chat adapter when set', async () => {
    const { getReeFactories } = await import('@src/extensions/loader.js');
    const runtime = new ReeRuntime({ config: mockConfig });
    runtime.setFactories(getReeFactories(mockConfig as any));

    const chat = runtime.createChat('c1', { context: mockContext });

    // Extension factories are async (dynamic imports) — await init.
    await chat.extensionsReady;

    // session-name registers a "session-name" command
    expect(chat.commands.size).toBeGreaterThanOrEqual(1);

    // capabilities registers a before_agent_start handler
    expect(chat.emitter.listenerCount('before_agent_start')).toBeGreaterThanOrEqual(1);

    // token-meter registers an agent_end handler
    expect(chat.emitter.listenerCount('agent_end')).toBeGreaterThanOrEqual(1);
  });

  it('createChat with no factories set does not throw', async () => {
    const runtime = new ReeRuntime({ config: mockConfig });
    const chat = runtime.createChat('c1', { context: mockContext });
    await expect(chat.extensionsReady).resolves.toBeUndefined();
  });
});

describe('Extension subset wiring — createRunner sets factories on the runtime', () => {
  it('createRunner({ sdk: "ree" }) wires getReeFactories into the runtime', async () => {
    const { createRunner } = await import('@src/agent-runner/index.js');

    const runner: any = createRunner(runnerContext, { ...mockConfig, sdk: 'ree' } as any);

    // The runner exposes its runtime (read-only) for introspection/testing.
    expect(runner.runtime).toBeDefined();
    expect(runner.runtime.factories.length).toBe(4);
  });
});

describe('Extension subset wiring — a real prompt initializes extensions on the chat', () => {
  it('prompt() via a factory-wired runtime initializes extensions on the chat', async () => {
    const { ReeRuntime } = await import('@src/runtime/ree-runtime.js');
    const { ReeAgentRunner } = await import('@src/agent-runner/ree-runner.js');
    const { getReeFactories } = await import('@src/extensions/loader.js');

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
            controller.enqueue(enc.encode(sse({
              id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 1, model: 'test',
              choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
            })));
            controller.enqueue(enc.encode(sse({
              id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 1, model: 'test',
              choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }],
            })));
            controller.enqueue(enc.encode(sse({
              id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 1, model: 'test',
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            })));
            controller.close();
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    );

    const config: any = {
      ...mockConfig,
      sdk: 'ree',
      ree: {
        model: { provider: 'custom', id: 'test-model', baseUrl: 'http://localhost/v1', apiKey: 'test', fetch: mockFetch },
        maxIterations: 1,
      },
    };

    // Construct the runtime directly (avoids the module-level singleton)
    // and wire factories — exactly what createRunner does in production.
    const runtime = new ReeRuntime({ config });
    runtime.setFactories(getReeFactories(config));
    const runner = new ReeAgentRunner(runtime, runnerContext, config);

    const events: any[] = [];
    await runner.prompt('hello', (e) => events.push(e));

    // The chat was created (via getOrCreateChat → createChat) and extensions
    // were initialized on it.
    const chat: any = runtime.getChat('main');
    expect(chat).toBeDefined();
    expect(chat.commands.size).toBeGreaterThanOrEqual(1);
    expect(chat.emitter.listenerCount('before_agent_start')).toBeGreaterThanOrEqual(1);
  });
});
