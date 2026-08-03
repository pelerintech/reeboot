/**
 * Spec: ws-conversation-ingress (handler-level, no socket)
 *
 * The real WS handler stamps `conversationId` from the path and, in ree mode,
 * no longer requires a pre-registered context. We drive the real wsChatHandler
 * callbacks directly (no TCP/browser socket). The MessageBus is mocked so
 * published messages are captured for inspection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { openDatabase, closeDb } from '../src/db/index.js';
import { wsChatHandler } from '../src/server.js';
import { createIncomingMessage } from '@src/channels/interface.js';

// Captured bus publishes (populated by the mocked MessageBus below).
const published: any[] = [];

vi.mock('@src/channels/interface.js', async (importActual) => {
  const actual = await importActual<typeof import('@src/channels/interface.js')>();
  class CapturingBus extends actual.MessageBus {
    publish(message: any): void {
      published.push(message);
    }
    onMessage(): () => void {
      return () => {};
    }
  }
  return { ...actual, MessageBus: CapturingBus };
});

function fakeWs() {
  const sends: any[] = [];
  const closed: Array<{ code?: number; reason?: string }> = [];
  const ws = {
    send: (data: string) => {
      try { sends.push(JSON.parse(data)); } catch { sends.push(data); }
    },
    close: (code?: number, reason?: string) => closed.push({ code, reason }),
  };
  return { ws, sends, closed };
}

function makeModelConfig() {
  return {
    authMode: 'own',
    provider: 'openai',
    id: 'm',
    apiKey: 'k',
    providers: [] as any[],
  };
}

function reeConfig() {
  return {
    sdk: 'ree',
    channels: { web: { enabled: true } },
    routing: { default: 'main', rules: [] },
    agent: { name: 'Test', runner: 'ree', model: makeModelConfig() },
    resilience: {
      recovery: { mode: 'safe_only', side_effect_tools: [] },
      scheduler: { catchup_window: '1h' },
      outage_threshold: 3,
      probe_interval: '1h',
    },
  } as any;
}

async function bootApp(config: any) {
  const reebotDir = mkdtempSync(join(tmpdir(), 'reesboot-ws-'));
  const db = openDatabase(join(reebotDir, 'reesboot.db'));
  const { buildApp, stopServer } = await import('@src/server.js');
  const app = await buildApp({ db, reebotDir, config });
  return { app, db, reebotDir, stop: async () => { try { await stopServer(); } catch {} } };
}

describe('ws-conversation-ingress (ree mode)', () => {
  let app: any;
  let db: any;
  let reebotDir: string;
  let stop: () => Promise<void>;

  beforeEach(async () => {
    published.length = 0;
    ({ app, db, reebotDir, stop } = await bootApp(reeConfig()));
  });

  afterEach(async () => {
    await stop();
    try { closeDb(); } catch { /* ignore */ }
    rmSync(reebotDir, { recursive: true, force: true });
  });

  function reeHandler(contextId: string) {
    return wsChatHandler({ db, contextId, clientIp: '127.0.0.1', isReeMode: true });
  }

  it('S1 — path segment becomes conversationId with distinct peerIds', async () => {
    const { ws, sends } = fakeWs();
    const ha = reeHandler('A');
    ha.onOpen({}, ws); // registers peer
    await ha.onMessage({ data: JSON.stringify({ type: 'message', content: 'from A' }) }, ws);

    const { ws: wsB, sends: sendsB } = fakeWs();
    const hb = reeHandler('B');
    hb.onOpen({}, wsB);
    await hb.onMessage({ data: JSON.stringify({ type: 'message', content: 'from B' }) }, wsB);

    const aMsg = published.find((m) => m.channelType === 'web' && m.conversationId === 'A');
    const bMsg = published.find((m) => m.channelType === 'web' && m.conversationId === 'B');
    expect(aMsg).toBeDefined();
    expect(bMsg).toBeDefined();
    expect(aMsg.content).toBe('from A');
    expect(bMsg.content).toBe('from B');
    expect(aMsg.peerId).not.toBe(bMsg.peerId);
  });

  it('S2 — unknown id is NOT rejected in ree mode (no 4004, connected sent)', () => {
    const { ws, sends, closed } = fakeWs();
    reeHandler('never-seen-before').onOpen({}, ws);
    expect(closed.length).toBe(0);
    expect(sends.find((m) => m.type === 'connected')).toBeDefined();
  });

  it('S3 — reserved/invalid id is rejected before dispatch (no publish)', async () => {
    const main = fakeWs();
    const hmain = reeHandler('main');
    hmain.onOpen({}, main.ws);
    await hmain.onMessage({ data: JSON.stringify({ type: 'message', content: 'should be rejected' }) }, main.ws);
    expect(main.sends.some((m) => m.type === 'error')).toBe(true);

    const invalid = fakeWs();
    const hbad = reeHandler('has space');
    hbad.onOpen({}, invalid.ws);
    await hbad.onMessage({ data: JSON.stringify({ type: 'message', content: 'also rejected' }) }, invalid.ws);
    expect(invalid.sends.some((m) => m.type === 'error')).toBe(true);

    expect(published.find((m) => m.channelType === 'web' && (m.conversationId === 'main' || m.conversationId === 'has space'))).toBeUndefined();
  });
});

// ─── Pi mode: WS still context-gated, no conversationId stamped ────────────────

describe('ws-conversation-ingress (pi mode)', () => {
  let app: any;
  let db: any;
  let reebotDir: string;
  let stop: () => Promise<void>;

  function piConfig() {
    return { ...reeConfig(), sdk: 'pi', agent: { ...reeConfig().agent, runner: 'pi' } };
  }

  beforeEach(async () => {
    published.length = 0;
    ({ app, db, reebotDir, stop } = await bootApp(piConfig()));
  });

  afterEach(async () => {
    await stop();
    try { closeDb(); } catch { /* ignore */ }
    rmSync(reebotDir, { recursive: true, force: true });
  });

  it('S4 — known context connects; message routes with no conversationId; unknown context gets 4004', async () => {
    const h = wsChatHandler({ db, contextId: 'main', clientIp: '127.0.0.1', isReeMode: false });
    const known = fakeWs();
    h.onOpen({}, known.ws);
    expect(known.closed.length).toBe(0);
    expect(known.sends.find((m) => m.type === 'connected')).toBeDefined();

    await h.onMessage({ data: JSON.stringify({ type: 'message', content: 'hi from pi' }) }, known.ws);
    const piMsg = published.find((m) => m.channelType === 'web' && m.content === 'hi from pi');
    expect(piMsg).toBeDefined();
    expect(piMsg.conversationId).toBeUndefined();

    const unknown = fakeWs();
    wsChatHandler({ db, contextId: 'never-heard-of', clientIp: '127.0.0.1', isReeMode: false }).onOpen({}, unknown.ws);
    expect(unknown.closed[0]?.code).toBe(4004);
  });
});
