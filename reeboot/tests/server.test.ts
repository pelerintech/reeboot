import { describe, it, expect, beforeEach, afterEach } from 'vitest';

let startServer: any;
let stopServer: any;

beforeEach(async () => {
  ({ startServer, stopServer } = await import('@src/server.js'));
});

afterEach(async () => {
  try { await stopServer(); } catch { /* already stopped */ }
});

describe('HTTP Server', () => {
  it('starts and listens on configured port', async () => {
    const server = await startServer({ port: 0, logLevel: 'silent' });
    const address = server.addresses()[0];
    expect(address).toBeDefined();
    expect(address.port).toBeGreaterThan(0);
  });

  it('GET /api/health returns { status, uptime, version }', async () => {
    const server = await startServer({ port: 0, logLevel: 'silent' });
    const address = server.addresses()[0];
    const res = await fetch(`http://localhost:${address.port}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.version).toBe('string');
  });

  it('GET /api/status returns { agent, channels }', async () => {
    const server = await startServer({ port: 0, logLevel: 'silent' });
    const address = server.addresses()[0];
    const res = await fetch(`http://localhost:${address.port}/api/status`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.agent).toBeDefined();
    expect(Array.isArray(body.channels)).toBe(true);
  });

  it('unknown routes return 404 JSON with error key', async () => {
    const server = await startServer({ port: 0, logLevel: 'silent' });
    const address = server.addresses()[0];
    const res = await fetch(`http://localhost:${address.port}/api/nonexistent`);
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBeDefined();
  });

  it('stopServer() resolves without error', async () => {
    await startServer({ port: 0, logLevel: 'silent' });
    await expect(stopServer()).resolves.toBeUndefined();
  });
});
