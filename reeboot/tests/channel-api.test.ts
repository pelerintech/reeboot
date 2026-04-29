/**
 * Channel REST API tests (Hono version)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';

let startServer: any;
let stopServer: any;
let tmpDir: string;
let db: Database.Database;

// Mock channel adapters so we don't actually start WhatsApp
vi.mock('./channels/whatsapp.js', () => ({
  WhatsAppAdapter: class {
    async init() {}
    async start() {}
    async stop() {}
    async send() {}
    status() { return 'disconnected'; }
  },
  default: undefined,
}));

vi.mock('./channels/web.js', () => ({
  WebAdapter: class {
    async init() {}
    async start() {}
    async stop() {}
    async send() {}
    status() { return 'connected'; }
    registerPeer() {}
    unregisterPeer() {}
    getBus() { return null; }
  },
  webAdapter: {
    init: async () => {},
    start: async () => {},
    stop: async () => {},
    send: async () => {},
    status: () => 'connected',
    registerPeer: () => {},
    unregisterPeer: () => {},
    getBus: () => null,
  },
  default: undefined,
}));

beforeEach(async () => {
  tmpDir = join(tmpdir(), `reeboot-channel-api-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new Database(join(tmpDir, 'test.db'));

  vi.resetModules();
  ({ startServer, stopServer } = await import('@src/server.js'));
});

afterEach(async () => {
  try { await stopServer(); } catch { /* ignore */ }
  try { db.close(); } catch { /* ignore */ }
  rmSync(tmpDir, { recursive: true, force: true });
});

async function startTestServer() {
  const { port } = await startServer({ port: 0, logLevel: 'silent', db, reebotDir: tmpDir });
  return { port, base: `http://localhost:${port}` };
}

describe('GET /api/channels', () => {
  it('returns 200 with array', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/channels`);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('each item has type, status, connectedAt fields', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/channels`);
    const body = await res.json() as any[];
    for (const ch of body) {
      expect(ch).toHaveProperty('type');
      expect(ch).toHaveProperty('status');
      expect(ch).toHaveProperty('connectedAt');
    }
  });
});

describe('POST /api/channels/:type/login', () => {
  it('unknown type returns 404', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/channels/unknown/login`, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/channels/:type/logout', () => {
  it('unknown type returns 404', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/channels/unknown/logout`, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
