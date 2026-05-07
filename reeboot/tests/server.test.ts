import { describe, it, expect, beforeEach, afterEach } from 'vitest';

let startServer: any;
let stopServer: any;

beforeEach(async () => {
  ({ startServer, stopServer } = await import('@src/server.js'));
});

afterEach(async () => {
  try { await stopServer(); } catch { /* already stopped */ }
});

describe('HTTP Server (Hono)', () => {
  it('starts and listens on configured port', async () => {
    const result = await startServer({ port: 0, logLevel: 'silent' });
    expect(result).toBeDefined();
    expect(result.port).toBeGreaterThan(0);
    expect(result.host).toBe('127.0.0.1');
  });

  it('GET /api/health returns { status, uptime, version }', async () => {
    const { port } = await startServer({ port: 0, logLevel: 'silent' });
    const res = await fetch(`http://localhost:${port}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.version).toBe('string');
  });

  it('GET /api/status returns { agent, channels }', async () => {
    const { port } = await startServer({ port: 0, logLevel: 'silent' });
    const res = await fetch(`http://localhost:${port}/api/status`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.agent).toBeDefined();
    expect(Array.isArray(body.channels)).toBe(true);
  });

  it('unknown routes return 404 JSON with error key', async () => {
    const { port } = await startServer({ port: 0, logLevel: 'silent' });
    const res = await fetch(`http://localhost:${port}/api/nonexistent`);
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBeDefined();
  });

  it('stopServer() resolves without error', async () => {
    await startServer({ port: 0, logLevel: 'silent' });
    await expect(stopServer()).resolves.toBeUndefined();
  });

  it('stopServer() is idempotent', async () => {
    await startServer({ port: 0, logLevel: 'silent' });
    await stopServer();
    await expect(stopServer()).resolves.toBeUndefined();
  });
});
