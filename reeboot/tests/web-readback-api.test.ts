import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, type TestAppHost } from './helpers/test-app.js';

let host: TestAppHost;

beforeAll(async () => {
  host = await buildTestApp();
});

beforeEach(() => {
  // Isolate each test from rows left by previous tests.
  host.db.exec('DELETE FROM messages');
  host.db.exec('DELETE FROM operational_logs');
});

afterAll(async () => {
  await host.stop();
  host.cleanup();
});

async function api(path: string, init?: any): Promise<Response> {
  return host.app.request(`http://localhost${path}`, init);
}

function insertMessage(role: string, content: string, contextId = 'main') {
  host.db.prepare(
    `INSERT INTO messages (id, context_id, channel, peer_id, role, content)
     VALUES (?, ?, 'web', 'p1', ?, ?)`
  ).run(`m-${Math.random().toString(36).slice(2)}`, contextId, role, content);
}

function insertLog(level: number, msg: string, component: string | null = null) {
  host.db.prepare(
    `INSERT INTO operational_logs (level, msg, component) VALUES (?, ?, ?)`
  ).run(level, msg, component);
}

describe('GET /api/contexts/:id/messages', () => {
  it('S1 — returns persisted messages in chronological order', async () => {
    insertMessage('user', 'hello');
    insertMessage('assistant', 'hi');
    insertMessage('user', 'bye');

    const res = await api('/api/contexts/main/messages');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(3);
    expect(body[0].content).toBe('hello');
    expect(body[1].content).toBe('hi');
    expect(body[2].content).toBe('bye');
    for (const row of body) {
      expect(typeof row.role).toBe('string');
      expect(typeof row.content).toBe('string');
      expect(typeof row.created_at).toBe('string');
    }
  });

  it('S2 — empty context returns empty array', async () => {
    const res = await api('/api/contexts/main/messages');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toEqual([]);
  });

  it('S3 — unknown context returns 404', async () => {
    const res = await api('/api/contexts/does-not-exist/messages');
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe('Context not found');
  });

  it('S4 — limit returns the most recent N in chronological order', async () => {
    insertMessage('user', 'm1');
    insertMessage('user', 'm2');
    insertMessage('user', 'm3');
    insertMessage('user', 'm4');
    insertMessage('user', 'm5');

    const res = await api('/api/contexts/main/messages?limit=2');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(2);
    expect(body[0].content).toBe('m4');
    expect(body[1].content).toBe('m5');
  });

  it('S5 — only the requested context\'s messages are returned', async () => {
    host.db.prepare("INSERT INTO contexts (id, name) VALUES ('work', 'Work')").run();
    insertMessage('user', 'work msg', 'work');
    insertMessage('user', 'main msg');

    const res = await api('/api/contexts/main/messages');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(1);
    expect(body[0].content).toBe('main msg');
  });
});

describe('GET /api/logs', () => {
  it('S1 — returns persisted logs mapped to LogRecord shape', async () => {
    insertLog(40, 'disk slow', 'scheduler');

    const res = await api('/api/logs?level=info');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(1);
    expect(body[0]).toMatchObject({
      timestamp: expect.any(String),
      level: 'warn',
      component: 'scheduler',
      message: 'disk slow',
    });
  });

  it('S2 — level filter excludes lower severities', async () => {
    insertLog(30, 'i');
    insertLog(50, 'e');

    const res = await api('/api/logs?level=error');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(1);
    expect(body[0].message).toBe('e');
  });

  it('S3 — default level is info and returns chronological order', async () => {
    insertLog(30, 'first');
    insertLog(40, 'second');

    const res = await api('/api/logs');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(2);
    expect(body[0].message).toBe('first');
    expect(body[0].level).toBe('info');
    expect(body[1].message).toBe('second');
    expect(body[1].level).toBe('warn');
  });

  it('S4 — limit returns the most recent N in chronological order', async () => {
    for (let i = 0; i < 5; i++) {
      insertLog(30, `log-${i}`);
    }

    const res = await api('/api/logs?limit=2');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(2);
    expect(body[0].message).toBe('log-3');
    expect(body[1].message).toBe('log-4');
  });

  it('S5 — empty table returns empty array', async () => {
    const res = await api('/api/logs');
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toEqual([]);
  });
});
