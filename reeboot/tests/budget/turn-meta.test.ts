import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageBus, createIncomingMessage } from '@src/channels/interface.js';
import { mkdtempSync, existsSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

function makeMsg(channelType = 'scheduler', content = 'Task: do something') {
  return createIncomingMessage({
    channelType,
    peerId: 'peer1',
    content,
    raw: {},
  });
}

function makeRunner() {
  return {
    prompt: vi.fn().mockImplementation(async (_content: string, onEvent: any) => {
      onEvent({ type: 'text_delta', delta: 'done' });
      onEvent({ type: 'message_end', runId: 'r1', usage: { input: 10, output: 5 } });
    }),
    abort: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAdapter() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue('connected'),
  };
}

describe('Orchestrator writes .reeboot_turn_meta.json before dispatch', () => {
  let tmpDir: string;
  let origHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-turn-meta-test-'));
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes meta file with operationType=scheduler before runner.prompt()', async () => {
    const { Orchestrator } = await import('@src/orchestrator.js');
    const bus = new MessageBus();
    const runner = makeRunner();
    const adapter = makeAdapter();
    let metaAtDispatch: any = null;

    // Intercept prompt to capture meta file at time of call
    runner.prompt.mockImplementation(async (_content: string, onEvent: any) => {
      // The meta file should exist at this point
      const metaPath = join(tmpDir, 'contexts', 'main', 'workspace', '.reeboot_turn_meta.json');
      if (existsSync(metaPath)) {
        metaAtDispatch = JSON.parse(readFileSync(metaPath, 'utf-8'));
      }
      onEvent({ type: 'text_delta', delta: 'done' });
      onEvent({ type: 'message_end', runId: 'r1', usage: { input: 10, output: 5 } });
    });

    const runners = new Map([['main', runner]]);
    const adapters = new Map([['web', adapter]]);
    const config = {
      routing: { default: 'main', rules: [] },
      reebootDir: tmpDir,
    };

    const orc = new Orchestrator(config, bus, adapters, runners);
    orc.start();

    bus.publish(makeMsg('scheduler'));
    await new Promise(r => setTimeout(r, 50));

    expect(runner.prompt).toHaveBeenCalled();
    expect(metaAtDispatch).not.toBeNull();
    expect(metaAtDispatch.operationType).toBe('scheduler');
    expect(metaAtDispatch.turnId).toBeDefined();
  });

  it('maps channelType to operationType correctly', async () => {
    const { Orchestrator } = await import('@src/orchestrator.js');
    const bus = new MessageBus();

    const channelTypeMappings: Array<[string, string]> = [
      ['scheduler', 'scheduler'],
      ['heartbeat', 'heartbeat'],
      ['recovery', 'recovery'],
      ['memory', 'memory'],
      ['whatsapp', 'user_message'],
      ['web', 'user_message'],
    ];

    for (const [channelType, expectedOpType] of channelTypeMappings) {
      const runner = makeRunner();
      let capturedMeta: any = null;

      runner.prompt.mockImplementation(async (_: string, onEvent: any) => {
        const metaPath = join(tmpDir, 'contexts', 'main', 'workspace', '.reeboot_turn_meta.json');
        if (existsSync(metaPath)) {
          capturedMeta = JSON.parse(readFileSync(metaPath, 'utf-8'));
        }
        onEvent({ type: 'text_delta', delta: 'done' });
        onEvent({ type: 'message_end', runId: 'r1', usage: { input: 10, output: 5 } });
      });

      const runners = new Map([['main', runner]]);
      const adapters = new Map([['whatsapp', makeAdapter()], ['web', makeAdapter()]]);
      const config = {
        routing: { default: 'main', rules: [] },
        reebootDir: tmpDir,
      };

      const orc = new Orchestrator(config, bus, adapters, runners);
      orc.start();

      bus.publish(makeMsg(channelType, 'test'));
      await new Promise(r => setTimeout(r, 50));

      orc.stop();

      expect(capturedMeta?.operationType).toBe(expectedOpType);
    }
  });
});
