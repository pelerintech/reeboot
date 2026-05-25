import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MessageBus, createIncomingMessage } from '@src/channels/interface.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeboot-trust-meta-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

async function makeOrc(channelConfig: Record<string, any>) {
  const { Orchestrator } = await import('@src/orchestrator.js');

  const bus = new MessageBus();
  const channelType = Object.keys(channelConfig)[0];

  const adapter = {
    send: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockReturnValue('connected'),
    connectedAt: vi.fn().mockReturnValue(null),
    selfAddress: vi.fn(() => null),
  };

  const workspaceDir = join(tmpDir, 'contexts', 'main', 'workspace');
  mkdirSync(workspaceDir, { recursive: true });
  const metaPath = join(workspaceDir, '.reeboot_turn_meta.json');

  let capturedMeta: any = null;

  const runner = {
    prompt: vi.fn().mockImplementation(async (_content: string, _onEvent: any, _opts?: any) => {
      try {
        const raw = readFileSync(metaPath, 'utf-8');
        capturedMeta = JSON.parse(raw);
      } catch { /* file not written yet */ }
    }),
    abort: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    getSessionPath: vi.fn(() => undefined),
  };

  const orc = new Orchestrator(
    {
      routing: { default: 'main', rules: [] },
      session: { inactivityTimeout: 14_400_000 },
      agent: { turnTimeout: 300_000 },
      channels: channelConfig,
      reebootDir: tmpDir,
    },
    bus,
    new Map([[channelType, adapter]]),
    new Map([['main', runner]]),
  );

  orc.start();

  bus.publish(createIncomingMessage({
    channelType,
    peerId: '+15551234567',
    content: 'hello',
    raw: {},
  }));

  await new Promise(r => setTimeout(r, 200));

  return { capturedMeta };
}

describe('orchestrator trust meta', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('writes trust: end-user into turn meta file', async () => {
    const { capturedMeta } = await makeOrc({
      whatsapp: { trust: 'end-user', trusted_senders: [] },
    });

    expect(capturedMeta).not.toBeNull();
    expect(capturedMeta.trust).toBe('end-user');
    expect(capturedMeta.operationType).toBe('user_message');
    expect(capturedMeta.turnId).toBeDefined();
  });

  it('defaults trust to owner when not specified', async () => {
    const { capturedMeta } = await makeOrc({
      signal: { trusted_senders: [] },
    });

    expect(capturedMeta).not.toBeNull();
    expect(capturedMeta.trust).toBe('owner');
  });

  it('writes trust: owner when explicitly set', async () => {
    const { capturedMeta } = await makeOrc({
      whatsapp: { trust: 'owner', trusted_senders: [] },
    });

    expect(capturedMeta).not.toBeNull();
    expect(capturedMeta.trust).toBe('owner');
  });
});