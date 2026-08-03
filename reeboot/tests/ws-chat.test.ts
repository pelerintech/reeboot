/**
 * WebSocket Chat handler tests (handler-level, no socket).
 *
 * Drives the real /ws/chat/:contextId handler callbacks (onOpen / onMessage /
 * onClose) directly with fixture payloads and a fake ws, asserting the emitted
 * frames — the design-recommended socket-free approach.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestAppHost } from './helpers/test-app.js';
import { wsChatHandler } from '../src/server.js';

let host: TestAppHost;

beforeAll(async () => {
  host = await buildTestApp();
});

afterAll(async () => {
  await host.stop();
  host.cleanup();
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

function handler(contextId: string, overrides: Record<string, any> = {}) {
  return wsChatHandler({
    db: host.db,
    contextId,
    clientIp: '127.0.0.1',
    serverToken: undefined,
    isReeMode: false,
    ...overrides,
  });
}

describe('WS /ws/chat/:contextId — handler level', () => {
  it('valid context "main" receives connected message with a sessionId', () => {
    const { ws, sends, closed } = fakeWs();
    handler('main').onOpen({}, ws);
    expect(closed.length).toBe(0);
    const connected = sends.find((m: any) => m.type === 'connected');
    expect(connected).toBeDefined();
    expect(connected.contextId).toBe('main');
    expect(connected.sessionId).toBeDefined();
  });

  it('unknown context closes with code 4004 (pi gating)', () => {
    const { ws, closed } = fakeWs();
    handler('nonexistent-ctx').onOpen({}, ws);
    expect(closed[0]?.code).toBe(4004);
  });

  it('invalid JSON receives an error frame', async () => {
    const { ws, sends } = fakeWs();
    await handler('main').onMessage({ data: 'not-json' }, ws);
    const err = sends.find((m: any) => m.type === 'error');
    expect(err).toBeDefined();
    expect(err.message).toMatch(/Invalid JSON/i);
  });

  it('message while bus not initialized yields a not-initialized error (no crash)', async () => {
    const { ws, sends, closed } = fakeWs();
    await handler('main').onMessage({ data: JSON.stringify({ type: 'message', content: 'hi' }) }, ws);
    expect(sends.some((m: any) => m.type === 'error')).toBe(true);
    expect(closed.length).toBe(0);
  });
});
