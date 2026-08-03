/**
 * Task REST API tests (socket-free via buildApp + app.request)
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

describe('GET /api/tasks', () => {
  it('returns 200 with empty array', async () => {
    const res = await api('/api/tasks');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns existing tasks', async () => {
    host.db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt) VALUES ('t1', 'main', '* * * * *', 'Test prompt')"
    ).run();

    const res = await api('/api/tasks');
    const body = await res.json() as any[];
    expect(body.some((t: any) => t.id === 't1')).toBe(true);
  });
});

describe('POST /api/tasks', () => {
  it('creates task and returns 201', async () => {
    const res = await api('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contextId: 'main',
        schedule: '0 9 * * *',
        prompt: 'Morning briefing',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.id).toBeDefined();
    expect(body.schedule).toBe('0 9 * * *');
    expect(body.prompt).toBe('Morning briefing');
  });

  it('with invalid cron returns 400', async () => {
    const res = await api('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contextId: 'main',
        schedule: 'not-cron',
        prompt: 'Invalid',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toMatch(/invalid|Invalid|schedule|cron/i);
  });

  it('persists to database', async () => {
    await api('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contextId: 'main',
        schedule: '0 18 * * *',
        prompt: 'Evening summary',
      }),
    });

    const task = host.db.prepare("SELECT * FROM tasks WHERE prompt = 'Evening summary'").get();
    expect(task).toBeDefined();
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('removes task and returns 204', async () => {
    host.db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt) VALUES ('del1', 'main', '* * * * *', 'Delete me')"
    ).run();

    const res = await api('/api/tasks/del1', { method: 'DELETE' });
    expect(res.status).toBe(204);

    const task = host.db.prepare("SELECT * FROM tasks WHERE id = 'del1'").get();
    expect(task).toBeUndefined();
  });

  it('returns 404 for unknown id', async () => {
    const res = await api('/api/tasks/nonexistent', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('deleted task does not appear in GET /api/tasks', async () => {
    host.db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt) VALUES ('del2', 'main', '* * * * *', 'Gone')"
    ).run();

    await api('/api/tasks/del2', { method: 'DELETE' });

    const res = await api('/api/tasks');
    const body = await res.json() as any[];
    expect(body.some((t: any) => t.id === 'del2')).toBe(false);
  });
});
