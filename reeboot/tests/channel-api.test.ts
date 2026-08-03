/**
 * Channel REST API tests (socket-free via buildApp + app.request)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, type TestAppHost } from './helpers/test-app.js';

let host: TestAppHost;

beforeAll(async () => {
  host = await buildTestApp();
});

afterAll(async () => {
  await host.stop();
  host.cleanup();
});

async function api(path: string, init?: any): Promise<Response> {
  return host.app.request(`http://localhost${path}`, init);
}

describe('GET /api/channels', () => {
  it('returns 200 with array', async () => {
    const res = await api('/api/channels');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('each item has type, status, connectedAt fields', async () => {
    const res = await api('/api/channels');
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
    const res = await api('/api/channels/unknown/login', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/channels/:type/logout', () => {
  it('unknown type returns 404', async () => {
    const res = await api('/api/channels/unknown/logout', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
