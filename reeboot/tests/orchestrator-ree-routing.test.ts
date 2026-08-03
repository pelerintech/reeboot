/**
 * Spec: ree-context-resolution
 *
 * In ree mode, context resolution uses the message's `conversationId`.
 * Also hosts the ree-dynamic-runner tests (tasks 5, 6, 8, 9, 12).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageBus, createIncomingMessage } from '@src/channels/interface.js';
import type { IncomingMessage } from '@src/channels/interface.js';
import type { AgentRunner } from '@src/agent-runner/interface.js';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync, mkdtempSync } from 'fs';
import { openDatabase, closeDb } from '../src/db/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMsg(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return createIncomingMessage({
    channelType: 'web',
    peerId: 'sess1',
    content: 'Hello',
    raw: null,
    ...overrides,
  });
}

function makeConfig(overrides: any = {}) {
  return {
    routing: { default: 'main', rules: [] },
    session: { inactivityTimeout: 14_400_000 },
    sdk: 'pi',
    ...overrides,
  } as any;
}

function makeRunner(responseText = 'Agent reply'): AgentRunner {
  return {
    prompt: vi.fn().mockImplementation(async (_content: string, onEvent: any) => {
      onEvent({ type: 'text_delta', delta: responseText });
      onEvent({ type: 'message_end', runId: 'r1', usage: { input: 10, output: 5 } });
    }),
    abort: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
  } as unknown as AgentRunner;
}

function makeAdapter() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue('connected'),
    startTyping: vi.fn().mockResolvedValue(undefined),
    stopTyping: vi.fn().mockResolvedValue(undefined),
  };
}

function wsConnect(url: string): Promise<{ ws: WebSocket; messages: any[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages: any[] = [];
    ws.onmessage = (e) => {
      try { messages.push(JSON.parse(e.data as string)); } catch { messages.push(e.data); }
    };
    ws.onopen = () => resolve({ ws, messages });
    ws.onerror = (e) => reject(e);
  });
}

function waitForMessage(messages: any[], predicate: (m: any) => boolean, timeout = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const found = messages.find(predicate);
      if (found) return resolve(found);
      if (Date.now() - start > timeout) return reject(new Error('Timeout waiting for message'));
      setTimeout(check, 50);
    };
    check();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ree-context-resolution', () => {
  let bus: MessageBus;
  let adapter: ReturnType<typeof makeAdapter>;
  let runner: ReturnType<typeof makeRunner>;
  let Orchestrator: any;

  beforeEach(async () => {
    vi.resetModules();
    ({ Orchestrator } = await import('@src/orchestrator.js'));
    bus = new MessageBus();
    adapter = makeAdapter();
    runner = makeRunner();
  });

  /**
   * Access the private resolver via a typed cast. `_resolveContext` is the unit
   * under test for this spec.
   */
  function resolveContext(orc: any, msg: IncomingMessage): string {
    return orc._resolveContext(msg);
  }

  it('S1 — ree resolves to conversationId', () => {
    const orc = new Orchestrator(makeConfig({ sdk: 'ree' }), bus, new Map(), new Map());
    const ctx = resolveContext(orc, makeMsg({ conversationId: 'cust-42' }));
    expect(ctx).toBe('cust-42');
  });

  it('S2 — ree falls back to peerId then default when conversationId absent', () => {
    const orc = new Orchestrator(makeConfig({ sdk: 'ree' }), bus, new Map(), new Map());
    // No conversationId → fall back to peerId
    const ctxPeer = resolveContext(orc, makeMsg({ peerId: 'peerX', conversationId: undefined }));
    expect(ctxPeer).toBe('peerX');
    // No peerId either → default
    const ctxDefault = resolveContext(orc, makeMsg({ peerId: '', conversationId: undefined }));
    expect(ctxDefault).toBe('main');
  });

  it('S3 — pi mode ignores conversationId (routing rules/default apply)', () => {
    const config = makeConfig({
      sdk: 'pi',
      routing: { default: 'main', rules: [{ channel: 'web', context: 'web-ctx' }] },
    });
    const orc = new Orchestrator(config, bus, new Map(), new Map());
    // conversationId is present but must be ignored in pi mode
    const ctx = resolveContext(orc, makeMsg({ conversationId: 'cust-42', peerId: 'sess1' }));
    expect(ctx).toBe('web-ctx');
  });
});

// ─── Task 5: Runner factory injection ─────────────────────────────────────────

describe('ree-dynamic-runner — factory injection (task 5)', () => {
  let bus: MessageBus;
  let Orchestrator: any;

  beforeEach(async () => {
    vi.resetModules();
    ({ Orchestrator } = await import('@src/orchestrator.js'));
    bus = new MessageBus();
  });

  it('accepts a runnerFactory option and stores it', () => {
    const factory = vi.fn();
    const orc = new Orchestrator(
      makeConfig({ sdk: 'ree' }),
      bus,
      new Map(),
      new Map(),
      undefined,
      { runnerFactory: factory }
    );
    expect(orc).toBeDefined();
    // The factory is stored for task 6's resolver to use.
    expect((orc as any)._runnerFactory).toBe(factory);
  });

  it('without runnerFactory the constructor still works (pi path)', () => {
    const orc = new Orchestrator(makeConfig({ sdk: 'pi' }), bus, new Map(), new Map());
    expect(orc).toBeDefined();
  });
});

// ─── Task 6: _resolveRunner lazy create/reuse ────────────────────────────────

describe('ree-dynamic-runner — lazy create/reuse (task 6)', () => {
  let bus: MessageBus;
  let adapter: ReturnType<typeof makeAdapter>;
  let Orchestrator: any;

  beforeEach(async () => {
    vi.resetModules();
    ({ Orchestrator } = await import('@src/orchestrator.js'));
    bus = new MessageBus();
    adapter = makeAdapter();
  });

  it('S1 — first message creates a runner (factory called once, no "No runner found")', async () => {
    const fakeRunner = makeRunner('ree reply');
    const factory = vi.fn().mockReturnValue(fakeRunner);
    const orc = new Orchestrator(
      makeConfig({ sdk: 'ree' }), bus,
      new Map([['web', adapter]]), new Map(),
      undefined, { runnerFactory: factory }
    );
    orc.start();

    bus.publish(makeMsg({ conversationId: 'A', content: 'hi' }));
    await new Promise(r => setTimeout(r, 30));

    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith('A');
    expect(fakeRunner.prompt).toHaveBeenCalled();
    // No "No runner found" reply was sent (the agent's real reply may be sent)
    const sendCalls = (adapter.send as any).mock.calls;
    expect(sendCalls.find((c: any[]) => typeof c[1]?.text === 'string' && c[1].text.includes('No runner found'))).toBeUndefined();

    orc.stop();
  });

  it('S2 — second message for same conversation reuses the runner (factory not called again)', async () => {
    const fakeRunner = makeRunner('ree reply');
    const factory = vi.fn().mockReturnValue(fakeRunner);
    const orc = new Orchestrator(
      makeConfig({ sdk: 'ree' }), bus,
      new Map([['web', adapter]]), new Map(),
      undefined, { runnerFactory: factory }
    );
    orc.start();

    bus.publish(makeMsg({ conversationId: 'A', content: 'one' }));
    await new Promise(r => setTimeout(r, 30));
    bus.publish(makeMsg({ conversationId: 'A', content: 'two' }));
    await new Promise(r => setTimeout(r, 30));

    expect(factory).toHaveBeenCalledTimes(1);
    expect(fakeRunner.prompt).toHaveBeenCalledTimes(2);

    orc.stop();
  });

  it('S3 — pi mode with unknown context still replies "No runner found"', async () => {
    const orc = new Orchestrator(
      makeConfig({ sdk: 'pi' }), bus,
      new Map([['web', adapter]]), new Map() // no runners registered
    );
    orc.start();

    bus.publish(makeMsg({ peerId: 'sess1', content: 'hi' }));
    await new Promise(r => setTimeout(r, 30));

    expect(adapter.send).toHaveBeenCalledWith(
      'sess1',
      expect.objectContaining({ type: 'text', text: expect.stringContaining('No runner found') })
    );

    orc.stop();
  });

  it('S4 — runner uses conversationId as chatId (getOrCreateChat called with correct id)', async () => {
    // Use a real ReeRuntime + ReeAgentRunner to verify that the runner drives
    // getOrCreateChat(chatId) where chatId === conversationId.
    const tmpDir = join(tmpdir(), `reeboot-s4-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const ldb = new Database(join(tmpDir, 'test.db'));
    const ReeRuntime = (await import('@src/runtime/ree-runtime.js')).ReeRuntime;
    const ReeAgentRunner = (await import('@src/agent-runner/ree-runner.js')).ReeAgentRunner;

    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(
        new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const frames = [
              'data: {"id":"c","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
              'data: {"id":"c","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"reply"},"finish_reason":null}]}\n\n',
              'data: {"id":"c","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
              'data: [DONE]\n\n',
            ];
            for (const f of frames) controller.enqueue(encoder.encode(f));
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      ))
    );

    const runtime = new ReeRuntime({
      config: {
        agent: { model: { provider: 'openai' } },
        ree: { model: { provider: 'custom', id: 'm', baseUrl: 'http://x/v1', apiKey: 'k', fetch: fetchImpl } },
      },
      maxChats: 10,
      idleTtlMs: 60000,
      maxHistoryPerChat: 50,
      db: ldb,
    });
    vi.spyOn(runtime, 'getOrCreateChat');

    const runner = new ReeAgentRunner(runtime, { id: 'A', workspacePath: tmpDir }, { agent: { model: { provider: 'openai' } } } as any);
    await runner.prompt('hello', () => {});

    expect(runtime.getOrCreateChat).toHaveBeenCalledWith('A', expect.anything());

    runner.dispose();
    ldb.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── Task 7: server registers ree runner-factory (shared workspace) ─────────────────────────────────────────────────────

describe('ree-shared-workspace — server runner-factory (task 7)', () => {
  let tmpDir: string;
  let db: Database.Database;
  let stopServer: any;
  const createdContexts: any[] = [];

  function reeConfig() {
    return {
      sdk: 'ree',
      channels: { web: { enabled: true } },
      routing: { default: 'main', rules: [] },
      agent: {
        name: 'Test',
        runner: 'ree',
        model: { authMode: 'own', provider: 'openai', id: 'm', apiKey: 'k', providers: [] },
      },
      resilience: {
        recovery: { mode: 'safe_only', side_effect_tools: [] },
        scheduler: { catchup_window: '1h' },
        outage_threshold: 3,
        probe_interval: '1h',
      },
    } as any;
  }

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), `reeboot-ws-shared-${Date.now()}`));
    db = openDatabase(join(tmpDir, 'test.db'));
    createdContexts.length = 0;

    // Mock createRunner so we can capture the ContextConfig (workspacePath)
    // passed for each lazily-created runner, without a real model/runner.
    vi.doMock('@src/agent-runner/index.js', async (importActual) => {
      const actual = await importActual<any>();
      const fakeRunner = () => ({
        prompt: async (_c: string, onEvent: any) => {
          onEvent({ type: 'text_delta', delta: 'reply' });
          onEvent({ type: 'message_end', runId: 'r', usage: {} });
        },
        abort: () => {},
        dispose: async () => {},
        reset: async () => {},
        reload: async () => {},
      });
      return {
        ...actual,
        createRunner: (ctx: any, config: any) => {
          createdContexts.push(ctx);
          return fakeRunner();
        },
      };
    });

    const { buildApp } = await import('@src/server.js');
    stopServer = (await import('@src/server.js')).stopServer;
    await buildApp({ db, reebotDir: tmpDir, config: reeConfig() });
  });

  afterEach(async () => {
    try { await stopServer(); } catch { /* ignore */ }
    try { closeDb(); } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('S1 — runners for A and B share one workspace path (contexts/__ree__/workspace)', async () => {
    const { webAdapter } = await import('@src/channels/web.js');
    const bus = webAdapter.getBus();
    expect(bus).not.toBeNull();

    // Drive the orchestrator to lazily create runners for two conversations,
    // exactly as a WebSocket message would, but without a real socket.
    bus!.publish(createIncomingMessage({ channelType: 'web', peerId: 'pA', conversationId: 'A', content: 'hi', raw: null }));
    bus!.publish(createIncomingMessage({ channelType: 'web', peerId: 'pB', conversationId: 'B', content: 'hi', raw: null }));

    await new Promise(r => setTimeout(r, 200));

    const convCtx = createdContexts.filter(c => c.id === 'A' || c.id === 'B');
    expect(convCtx.length).toBeGreaterThanOrEqual(2);
    const aCtx = convCtx.find(c => c.id === 'A');
    const bCtx = convCtx.find(c => c.id === 'B');
    expect(aCtx).toBeDefined();
    expect(bCtx).toBeDefined();
    expect(aCtx!.workspacePath).toBe(bCtx!.workspacePath);
    expect(aCtx!.workspacePath).toContain('__ree__');
    expect(aCtx!.workspacePath).not.toContain('/A');
    expect(aCtx!.workspacePath).not.toContain('/B');
  });
});

// ─── Task 8: Skip turn-meta write in ree mode ─────────────────────────────────

describe('ree-shared-workspace — turn-meta skip (task 8)', () => {
  let tmpDir: string;
  let db: Database.Database;
  let stopServer: any;

  function reeConfig() {
    return {
      sdk: 'ree',
      channels: { web: { enabled: true } },
      routing: { default: 'main', rules: [] },
      agent: {
        name: 'Test',
        runner: 'ree',
        model: { authMode: 'own', provider: 'openai', id: 'm', apiKey: 'k', providers: [] },
      },
      resilience: {
        recovery: { mode: 'safe_only', side_effect_tools: [] },
        scheduler: { catchup_window: '1h' },
        outage_threshold: 3,
        probe_interval: '1h',
      },
    } as any;
  }

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), `reeboot-meta-skip-${Date.now()}`));
    db = openDatabase(join(tmpDir, 'test.db'));

    // Mock createRunner to avoid a real model/runner; the turn still flows
    // through the orchestrator / turn-journal exactly as in production.
    vi.doMock('@src/agent-runner/index.js', async (importActual) => {
      const actual = await importActual<any>();
      return {
        ...actual,
        createRunner: () => ({
          prompt: async (_c: string, onEvent: any) => {
            onEvent({ type: 'text_delta', delta: 'reply' });
            onEvent({ type: 'message_end', runId: 'r', usage: {} });
          },
          abort: () => {},
          dispose: async () => {},
          reset: async () => {},
          reload: async () => {},
        }),
      };
    });

    const { buildApp } = await import('@src/server.js');
    stopServer = (await import('@src/server.js')).stopServer;
    await buildApp({ db, reebotDir: tmpDir, config: reeConfig() });
  });

  afterEach(async () => {
    try { await stopServer(); } catch { /* ignore */ }
    try { closeDb(); } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('S2 — no per-conversation turn-meta file is written in ree mode', async () => {
    const { webAdapter } = await import('@src/channels/web.js');
    const bus = webAdapter.getBus();
    expect(bus).not.toBeNull();

    // Drive a conversation turn like a WebSocket message, but without a socket.
    bus!.publish(createIncomingMessage({ channelType: 'web', peerId: 'pA', conversationId: 'A', content: 'hi', raw: null }));
    await new Promise(r => setTimeout(r, 200));

    const { existsSync } = await import('fs');
    const metaPath = join(tmpDir, 'contexts', 'A', 'workspace', '.reeboot_turn_meta.json');
    expect(existsSync(metaPath)).toBe(false);
    // The shared ree workspace exists, but no per-conversation dir was created.
    expect(existsSync(join(tmpDir, 'contexts', 'A'))).toBe(false);
    expect(existsSync(join(tmpDir, 'contexts', '__ree__', 'workspace'))).toBe(true);
  });

  it('S2b — the ree token-meter records the turn with the default operationType (no meta file)', async () => {
    // S2 (above) proves the ree orchestrator writes NO .reeboot_turn_meta.json.
    // This proves the spec's second half: given that no-meta condition, the
    // token-meter (extension #3 in getReeFactories) STILL records the turn, and
    // its operation_type falls back to the default 'user_message'.
    //
    // The token-meter writes via the global getDb() and only inserts when usage
    // is non-zero (token-meter.ts:38). So point getDb() at a test DB and drive
    // its REAL agent_end handler with a non-zero-usage event and a cwd that has
    // no meta file (the ree condition). No server → deterministic, no timing wait.
    const meterDb = new Database(':memory:');
    meterDb.exec(`CREATE TABLE usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      context_id TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      model TEXT NOT NULL DEFAULT '',
      cost_usd REAL NOT NULL DEFAULT 0,
      operation_type TEXT NOT NULL DEFAULT 'user_message'
    )`);
    vi.doMock('@src/db/index.js', () => ({ getDb: () => meterDb }));

    try {
      const handlers: Record<string, Function[]> = {};
      const pi = { on(ev: string, h: Function) { (handlers[ev] ??= []).push(h); } };
      const tokenMeter = await import('@src/extensions/token-meter.js');
      (tokenMeter.default as any)(pi);

      // A shared ree workspace dir with NO .reeboot_turn_meta.json (ree skips it).
      const reeWorkspace = join(tmpDir, 'contexts', '__ree__', 'workspace');
      mkdirSync(reeWorkspace, { recursive: true });
      const { existsSync } = await import('fs');
      expect(existsSync(join(reeWorkspace, '.reeboot_turn_meta.json'))).toBe(false);

      // Real agent_end event carrying non-zero usage on the last assistant message.
      const event = {
        messages: [
          { role: 'user', content: 'hi' },
          {
            role: 'assistant', content: 'hello', model: 'test-model',
            usage: { inputTokens: 12, outputTokens: 7, cost: { total: 0.001 } },
          },
        ],
      };
      await handlers['agent_end'][0](event, { cwd: reeWorkspace });

      // The turn WAS recorded, with the default operationType and real token counts.
      const row = meterDb.prepare('SELECT * FROM usage ORDER BY id DESC LIMIT 1').get() as any;
      expect(row).toBeDefined();
      expect(row.operation_type).toBe('user_message');
      expect(row.input_tokens).toBe(12);
      expect(row.output_tokens).toBe(7);
    } finally {
      vi.doUnmock('@src/db/index.js');
      meterDb.close();
    }
  });
});

// ─── Task 9: Skip messages-table writes in ree ────────────────────────────────

describe('ree-messages-skip (task 9)', () => {
  let bus: MessageBus;
  let adapter: ReturnType<typeof makeAdapter>;
  let Orchestrator: any;
  let db: Database.Database;

  beforeEach(async () => {
    vi.resetModules();
    ({ Orchestrator } = await import('@src/orchestrator.js'));
    bus = new MessageBus();
    adapter = makeAdapter();
    db = new Database(':memory:');
    db.exec(
      `CREATE TABLE messages (id TEXT PRIMARY KEY, context_id TEXT, channel TEXT, peer_id TEXT, role TEXT, content TEXT)`
    );
    // runResilienceMigration adds columns to `tasks` and `turn_journal`; both
    // tables must pre-exist (mirrors tests/messages-persistence.test.ts).
    db.exec(
      `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, context_id TEXT NOT NULL DEFAULT 'main', schedule TEXT NOT NULL DEFAULT '', prompt TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active', next_run TEXT)`
    );
    // The orchestrator's TurnJournal needs the turn_journal table (and closed_at
    // column added by runObservabilityMigration).
    const { runResilienceMigration, runObservabilityMigration } = await import('@src/db/schema.js');
    runResilienceMigration(db);
    runObservabilityMigration(db);
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
  });

  it('S1 — ree turn writes no messages rows', async () => {
    const runner = makeRunner('ree reply');
    const orc = new Orchestrator(
      makeConfig({ sdk: 'ree' }), bus,
      new Map([['web', adapter]]), new Map([['A', runner]]), db
    );
    orc.start();

    bus.publish(makeMsg({ conversationId: 'A', peerId: 'sess1', content: 'hi' }));
    await new Promise(r => setTimeout(r, 50));

    const count = db.prepare('SELECT count(*) as n FROM messages').get() as any;
    expect(count.n).toBe(0);

    orc.stop();
  });

  it('S3 — pi mode still writes messages (regression)', async () => {
    const runner = makeRunner('pi reply');
    const orc = new Orchestrator(
      makeConfig({ sdk: 'pi' }), bus,
      new Map([['web', adapter]]), new Map([['main', runner]]), db
    );
    orc.start();

    bus.publish(makeMsg({ peerId: 'sess1', content: 'hi' }));
    await new Promise(r => setTimeout(r, 50));

    const rows = db.prepare('SELECT role FROM messages ORDER BY rowid').all() as any[];
    expect(rows.length).toBe(2);
    expect(rows.map(r => r.role)).toEqual(['user', 'assistant']);

    orc.stop();
  });
});

// ─── Task 12: Lazy ree-runner eviction on inactivity ──────────────────────────

describe('ree-runner-eviction (task 12)', () => {
  let bus: MessageBus;
  let adapter: ReturnType<typeof makeAdapter>;
  let Orchestrator: any;

  beforeEach(async () => {
    vi.resetModules();
    ({ Orchestrator } = await import('@src/orchestrator.js'));
    bus = new MessageBus();
    adapter = makeAdapter();
  });

  it('S1 — inactive factory-created runner is evicted (dispose called, maps cleared)', async () => {
    const fakeRunner = makeRunner('ree reply');
    const factory = vi.fn().mockReturnValue(fakeRunner);
    const orc = new Orchestrator(
      makeConfig({ sdk: 'ree', session: { inactivityTimeout: 40 } }),
      bus, new Map([['web', adapter]]), new Map(),
      undefined, { runnerFactory: factory }
    );
    orc.start();

    bus.publish(makeMsg({ conversationId: 'A', content: 'hi' }));
    await new Promise(r => setTimeout(r, 30));

    expect(factory).toHaveBeenCalledTimes(1);
    expect(orc.runners.has('A')).toBe(true);

    await new Promise(r => setTimeout(r, 140));

    expect(orc.runners.has('A')).toBe(false);
    expect((orc as any)._contextState.has('A')).toBe(false);
    expect(fakeRunner.dispose).toHaveBeenCalled();

    orc.stop();
  });

  it('S2 — a re-arriving conversation is re-created', async () => {
    const fakeRunner1 = makeRunner('ree reply 1');
    const fakeRunner2 = makeRunner('ree reply 2');
    const factory = vi.fn().mockReturnValueOnce(fakeRunner1).mockReturnValueOnce(fakeRunner2);
    const orc = new Orchestrator(
      makeConfig({ sdk: 'ree', session: { inactivityTimeout: 40 } }),
      bus, new Map([['web', adapter]]), new Map(),
      undefined, { runnerFactory: factory }
    );
    orc.start();

    bus.publish(makeMsg({ conversationId: 'A', content: 'one' }));
    await new Promise(r => setTimeout(r, 30));
    await new Promise(r => setTimeout(r, 140));
    expect(orc.runners.has('A')).toBe(false);

    bus.publish(makeMsg({ conversationId: 'A', content: 'two' }));
    await new Promise(r => setTimeout(r, 30));

    expect(factory).toHaveBeenCalledTimes(2);
    expect(orc.runners.has('A')).toBe(true);
    expect(fakeRunner2.prompt).toHaveBeenCalled();

    orc.stop();
  });

  it('S3 — pi runners are NOT evicted on inactivity (reset only)', async () => {
    const piRunner = makeRunner('pi reply');
    const orc = new Orchestrator(
      makeConfig({ sdk: 'pi', session: { inactivityTimeout: 40 } }),
      bus, new Map([['web', adapter]]), new Map([['main', piRunner]])
    );
    orc.start();

    bus.publish(makeMsg({ peerId: 'sess1', content: 'hi' }));
    await new Promise(r => setTimeout(r, 30));
    await new Promise(r => setTimeout(r, 140));

    expect(orc.runners.has('main')).toBe(true);
    expect(piRunner.reset).toHaveBeenCalled();
    expect(piRunner.dispose).not.toHaveBeenCalled();

    orc.stop();
  });
});

// ─── Task 13: Cancel carries conversationId ──────────────────────────────────

describe('cancel-routing (task 13)', () => {
  let bus: MessageBus;
  let adapter: ReturnType<typeof makeAdapter>;
  let Orchestrator: any;

  beforeEach(async () => {
    vi.resetModules();
    ({ Orchestrator } = await import('@src/orchestrator.js'));
    bus = new MessageBus();
    adapter = makeAdapter();
  });

  /** A runner whose prompt hangs until abort. */
  function hangingRunner(): ReturnType<typeof makeRunner> {
    let abortCtl: AbortController | null = null;
    const runner: any = {
      prompt: vi.fn().mockImplementation(async (_content: string, onEvent: any) => {
        abortCtl = new AbortController();
        return new Promise<void>((resolve, reject) => {
          abortCtl!.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }),
      abort: vi.fn().mockImplementation(() => abortCtl?.abort()),
      dispose: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };
    return runner;
  }

  it('S1 — cancel on A aborts only A (B unaffected)', async () => {
    const runnerA = hangingRunner();
    const runnerB = hangingRunner();
    const factory = vi.fn().mockReturnValueOnce(runnerA).mockReturnValueOnce(runnerB);
    const orc = new Orchestrator(
      makeConfig({ sdk: 'ree' }), bus,
      new Map([['web', adapter]]), new Map(),
      undefined, { runnerFactory: factory }
    );
    orc.start();

    // Start in-flight turns on A and B
    bus.publish(makeMsg({ conversationId: 'A', peerId: 'peerA', content: 'hang A' }));
    bus.publish(makeMsg({ conversationId: 'B', peerId: 'peerB', content: 'hang B' }));
    await new Promise(r => setTimeout(r, 30));

    expect(runnerA.prompt).toHaveBeenCalled();
    expect(runnerB.prompt).toHaveBeenCalled();

    // Cancel on A's connection (carries conversationId: 'A')
    bus.publish(makeMsg({ conversationId: 'A', peerId: 'peerA', content: '', action: 'cancel' }));
    await new Promise(r => setTimeout(r, 30));

    expect(runnerA.abort).toHaveBeenCalled();
    expect(runnerB.abort).not.toHaveBeenCalled();

    orc.stop();
  });
});
