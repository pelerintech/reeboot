/**
 * REST API tests (socket-free via buildApp + app.request)
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

describe('GET /api/contexts', () => {
  it('returns an array (may be empty or have main)', async () => {
    const res = await api('/api/contexts');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns main context after server starts', async () => {
    const res = await api('/api/contexts');
    const body = await res.json() as any[];
    const main = body.find((c: any) => c.id === 'main');
    expect(main).toBeDefined();
  });
});

describe('POST /api/contexts', () => {
  it('creates context and returns 201 with context object', async () => {
    const res = await api('/api/contexts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'work', model_provider: 'anthropic', model_id: 'claude-sonnet-4-20250514' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.name).toBe('work');
    expect(body.id).toBeDefined();
  });

  it('missing name returns 400', async () => {
    const res = await api('/api/contexts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_provider: 'anthropic' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBeDefined();
  });

  it('new context appears in GET /api/contexts list', async () => {
    await api('/api/contexts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'personal', model_provider: 'anthropic', model_id: 'claude-sonnet-4-20250514' }),
    });
    const res = await api('/api/contexts');
    const list = await res.json() as any[];
    expect(list.some((c: any) => c.name === 'personal')).toBe(true);
  });
});

describe('GET /api/contexts/:id/sessions', () => {
  it('returns 200 with array for existing context', async () => {
    const res = await api('/api/contexts/main/sessions');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns 404 for unknown context', async () => {
    const res = await api('/api/contexts/nonexistent/sessions');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/channels', () => {
  it('returns 200 with empty array when no config', async () => {
    const res = await api('/api/channels');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(Array.isArray(body)).toBe(true);
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
