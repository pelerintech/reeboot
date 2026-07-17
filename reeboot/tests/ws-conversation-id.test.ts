/**
 * Spec: ws-conversation-ingress
 *
 * The Web/API WS handler supplies `conversationId` from the path and no longer
 * requires a pre-registered context in ree mode.
 *
 * The MessageBus is mocked so published messages are captured for inspection
 * (no real orchestrator dispatch is needed to verify ingress stamping).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';
import { defaultConfig } from '@src/config.js';

// Captured bus publishes (populated by the mocked MessageBus below).
const published: any[] = [];

vi.mock('@src/channels/interface.js', async (importActual) => {
  const actual = await importActual<typeof import('@src/channels/interface.js')>();
  class CapturingBus extends actual.MessageBus {
    publish(message: any): void {
      published.push(message);
    }
    onMessage(): () => void {
      // No-op subscription — we are testing ingress, not turn dispatch.
      return () => {};
    }
  }
  return { ...actual, MessageBus: CapturingBus };
});

let startServer: any;
let stopServer: any;
let tmpDir: string;
let db: Database.Database;

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

function waitForClose(url: string, timeout = 2000): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => reject(new Error('timeout')), timeout);
    ws.onclose = (e) => { clearTimeout(t); resolve(e.code); };
    ws.onerror = () => { /* onclose will follow */ };
  });
}

beforeEach(async () => {
  tmpDir = join(tmpdir(), `reeboot-ws-conv-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new Database(join(tmpDir, 'test.db'));
  published.length = 0;

  vi.resetModules();
  // Re-import after reset so the mock applies to the freshly loaded server.
  ({ startServer, stopServer } = await import('@src/server.js'));
});

afterEach(async () => {
  try { await stopServer(); } catch { /* ignore */ }
  try { db.close(); } catch { /* ignore */ }
  rmSync(tmpDir, { recursive: true, force: true });
});

function reeConfig() {
  return { ...defaultConfig, sdk: 'ree' as const };
}

describe('ws-conversation-ingress (ree mode)', () => {
  it('S1 — path segment becomes conversationId with distinct peerIds', async () => {
    const { port } = await startServer({
      port: 0, logLevel: 'silent', db, reebotDir: tmpDir, config: reeConfig(),
    });

    const a = await wsConnect(`ws://localhost:${port}/ws/chat/A`);
    await waitForMessage(a.messages, m => m.type === 'connected');
    a.ws.send(JSON.stringify({ type: 'message', content: 'from A' }));

    const b = await wsConnect(`ws://localhost:${port}/ws/chat/B`);
    await waitForMessage(b.messages, m => m.type === 'connected');
    b.ws.send(JSON.stringify({ type: 'message', content: 'from B' }));

    // Give publishes a moment to land
    await new Promise(r => setTimeout(r, 150));

    const aMsg = published.find(m => m.channelType === 'web' && m.conversationId === 'A');
    const bMsg = published.find(m => m.channelType === 'web' && m.conversationId === 'B');
    expect(aMsg).toBeDefined();
    expect(bMsg).toBeDefined();
    expect(aMsg.content).toBe('from A');
    expect(bMsg.content).toBe('from B');
    expect(aMsg.peerId).not.toBe(bMsg.peerId);

    a.ws.close();
    b.ws.close();
  });

  it('S2 — unknown id is NOT rejected in ree mode (no 4004)', async () => {
    const { port } = await startServer({
      port: 0, logLevel: 'silent', db, reebotDir: tmpDir, config: reeConfig(),
    });

    const { ws, messages } = await wsConnect(`ws://localhost:${port}/ws/chat/never-seen-before`);
    const connected = await waitForMessage(messages, m => m.type === 'connected');
    expect(connected.contextId).toBe('never-seen-before');
    ws.close();
  });

  it('S3 — reserved/invalid id is rejected before dispatch', async () => {
    const { port } = await startServer({
      port: 0, logLevel: 'silent', db, reebotDir: tmpDir, config: reeConfig(),
    });

    // Reserved id 'main' — connection may open, but a message must be rejected
    const reserved = await wsConnect(`ws://localhost:${port}/ws/chat/main`);
    await waitForMessage(reserved.messages, m => m.type === 'connected');
    reserved.ws.send(JSON.stringify({ type: 'message', content: 'should be rejected' }));
    const err = await waitForMessage(reserved.messages, m => m.type === 'error');
    expect(err.message).toMatch(/conversation|id|reserved|invalid/i);

    // Invalid id with a space — connect, send, expect error
    const invalid = await wsConnect(`ws://localhost:${port}/ws/chat/has%20space`);
    await waitForMessage(invalid.messages, m => m.type === 'connected').catch(() => {});
    invalid.ws.send(JSON.stringify({ type: 'message', content: 'also rejected' }));
    await waitForMessage(invalid.messages, m => m.type === 'error').catch(() => {});

    // Give any erroneous publishes a moment
    await new Promise(r => setTimeout(r, 150));

    // Nothing should have been dispatched for the rejected ids
    expect(published.find(m => m.channelType === 'web' && (m.conversationId === 'main' || m.conversationId === 'has space' || m.conversationId === 'has%20space'))).toBeUndefined();

    reserved.ws.close();
    invalid.ws.close();
  });
});
