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

describe('HTTP Server (Hono) via buildApp (socket-free)', () => {
  it('buildApp returns a drivable app', () => {
    expect(host.app).toBeDefined();
    expect(typeof host.app.request).toBe('function');
  });

  it('GET /api/health returns { status, uptime, version }', async () => {
    const res = await api('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.version).toBe('string');
  });

  it('GET /api/status returns { agent, channels }', async () => {
    const res = await api('/api/status');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.agent).toBeDefined();
    expect(Array.isArray(body.channels)).toBe(true);
  });

  it('unknown routes return 404 JSON with error key', async () => {
    const res = await api('/api/nonexistent');
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBeDefined();
  });
});

describe('stopServer()', () => {
  it('stopServer() resolves without error and is idempotent', async () => {
    const h = await buildTestApp();
    await h.stop();
    await expect(h.stop()).resolves.toBeUndefined();
    h.cleanup();
  });
});
