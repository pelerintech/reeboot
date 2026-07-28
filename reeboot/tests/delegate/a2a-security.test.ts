import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

describe('A2A security — API key authentication', () => {
  const API_KEY = 'reeboot-secret-key';

  function buildApp(withKey: boolean) {
    const app = new Hono();

    // Add auth middleware for capabilities
    app.get('/a2a/capabilities', async (c) => {
      if (withKey) {
        const auth = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
        if (auth !== API_KEY) {
          return c.json({ error: 'Unauthorized' }, 401);
        }
      }
      return c.json({ name: 'reeboot', version: '2.6.0', tools: [], protocols: ['a2a-v1'] });
    });

    // Add auth middleware for invoke
    app.post('/a2a/invoke', async (c) => {
      if (withKey) {
        const auth = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
        if (auth !== API_KEY) {
          return c.json({ error: 'Unauthorized' }, 401);
        }
      }
      return c.json({ status: 'completed', result: 'Task done' });
    });

    return app;
  }

  it('GET /a2a/capabilities returns 401 without API key when auth is required', async () => {
    const app = buildApp(true);
    const res = await app.request('/a2a/capabilities');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('GET /a2a/capabilities returns 200 with correct API key', async () => {
    const app = buildApp(true);
    const res = await app.request('/a2a/capabilities', {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('reeboot');
  });

  it('POST /a2a/invoke returns 401 without API key when auth is required', async () => {
    const app = buildApp(true);
    const res = await app.request('/a2a/invoke', {
      method: 'POST',
      body: JSON.stringify({ task: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('POST /a2a/invoke returns 401 with wrong API key', async () => {
    const app = buildApp(true);
    const res = await app.request('/a2a/invoke', {
      method: 'POST',
      body: JSON.stringify({ task: 'test' }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-key',
      },
    });
    expect(res.status).toBe(401);
  });

  it('POST /a2a/invoke returns 200 with correct API key', async () => {
    const app = buildApp(true);
    const res = await app.request('/a2a/invoke', {
      method: 'POST',
      body: JSON.stringify({ task: 'test' }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
    });
    expect(res.status).toBe(200);
  });

  it('endpoints work without auth when no key is configured', async () => {
    const app = buildApp(false);
    const res1 = await app.request('/a2a/capabilities');
    expect(res1.status).toBe(200);

    const res2 = await app.request('/a2a/invoke', {
      method: 'POST',
      body: JSON.stringify({ task: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res2.status).toBe(200);
  });
});
