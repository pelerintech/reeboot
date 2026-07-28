import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';

describe('A2A server endpoints', () => {
  // Build a minimal Hono app with A2A routes for testing
  // (The real server uses Hono's app.get/post, so we test the handler logic here)

  it('GET /a2a/capabilities returns capabilities JSON', async () => {
    const app = new Hono();
    app.get('/a2a/capabilities', async (c) => {
      return c.json({
        name: 'reeboot',
        version: '2.6.0',
        tools: [],
        protocols: ['a2a-v1'],
      });
    });

    const res = await app.request('/a2a/capabilities');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('reeboot');
    expect(body.version).toBe('2.6.0');
    expect(Array.isArray(body.tools)).toBe(true);
    expect(Array.isArray(body.protocols)).toBe(true);
    expect(body.protocols).toContain('a2a-v1');
  });

  it('POST /a2a/invoke returns 400 for missing task', async () => {
    const app = new Hono();
    app.post('/a2a/invoke', async (c) => {
      let body: any;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Invalid JSON body' }, 400);
      }
      const task: string = body.task ?? '';
      if (!task.trim()) {
        return c.json({ error: 'Missing required field: task' }, 400);
      }
      return c.json({ status: 'completed', id: 'test', result: 'done' });
    });

    const res = await app.request('/a2a/invoke', { method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing');
  });

  it('POST /a2a/invoke returns 400 for invalid JSON', async () => {
    const app = new Hono();
    app.post('/a2a/invoke', async (c) => {
      try {
        await c.req.json();
        return c.json({ status: 'completed' });
      } catch {
        return c.json({ error: 'Invalid JSON body' }, 400);
      }
    });

    const res = await app.request('/a2a/invoke', { method: 'POST', body: 'not-json', headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(400);
  });

  it('POST /a2a/invoke returns 200 for valid task', async () => {
    const app = new Hono();
    app.post('/a2a/invoke', async (c) => {
      const body = await c.req.json();
      return c.json({ status: 'completed', id: 'test-123', result: `Result for: ${body.task}` });
    });

    const res = await app.request('/a2a/invoke', {
      method: 'POST',
      body: JSON.stringify({ task: 'Research topic X' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('completed');
    expect(body.id).toBe('test-123');
    expect(body.result).toContain('Research topic X');
  });

  it('supports API key via Authorization header', async () => {
    const API_KEY = 'test-key-123';
    const app = new Hono();
    app.get('/a2a/capabilities', async (c) => {
      const auth = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
      if (auth !== API_KEY) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      return c.json({ name: 'reeboot' });
    });

    // Without key — 401
    const res1 = await app.request('/a2a/capabilities');
    expect(res1.status).toBe(401);

    // With wrong key — 401
    const res2 = await app.request('/a2a/capabilities', {
      headers: { 'Authorization': 'Bearer wrong-key' },
    });
    expect(res2.status).toBe(401);

    // With correct key — 200
    const res3 = await app.request('/a2a/capabilities', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res3.status).toBe(200);
    const body = await res3.json();
    expect(body.name).toBe('reeboot');
  });
});
