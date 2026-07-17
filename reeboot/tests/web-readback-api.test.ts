import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';

let startServer: any;
let stopServer: any;
let tmpDir: string;
let db: Database.Database;

beforeEach(async () => {
  tmpDir = join(tmpdir(), `reeboot-web-readback-test-${Date.now()}`);
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

function createMessagesTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT    PRIMARY KEY,
      context_id  TEXT    NOT NULL,
      channel     TEXT    NOT NULL,
      peer_id     TEXT    NOT NULL,
      role        TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      tokens_used INTEGER          DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function insertMessage(role: string, content: string, contextId = 'main') {
  db.prepare(
    `INSERT INTO messages (id, context_id, channel, peer_id, role, content)
     VALUES (?, ?, 'web', 'p1', ?, ?)`
  ).run(`m-${Math.random().toString(36).slice(2)}`, contextId, role, content);
}

function createOperationalLogsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operational_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      level       INTEGER NOT NULL,
      msg         TEXT NOT NULL,
      component   TEXT,
      context_id  TEXT,
      payload     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function insertLog(level: number, msg: string, component: string | null = null) {
  db.prepare(
    `INSERT INTO operational_logs (level, msg, component) VALUES (?, ?, ?)`
  ).run(level, msg, component);
}

describe('GET /api/contexts/:id/messages', () => {
  beforeEach(() => {
    createMessagesTable();
  });

  it('S1 — returns persisted messages in chronological order', async () => {
    const { base } = await startTestServer();
    insertMessage('user', 'hello');
    insertMessage('assistant', 'hi');
    insertMessage('user', 'bye');

    const res = await fetch(`${base}/api/contexts/main/messages`);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(3);
    // Assert chronological order by content
    expect(body[0].content).toBe('hello');
    expect(body[1].content).toBe('hi');
    expect(body[2].content).toBe('bye');
    // Each item has role, content, created_at
    for (const row of body) {
      expect(typeof row.role).toBe('string');
      expect(typeof row.content).toBe('string');
      expect(typeof row.created_at).toBe('string');
    }
  });

  it('S2 — empty context returns empty array', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/contexts/main/messages`);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toEqual([]);
  });

  it('S3 — unknown context returns 404', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/contexts/does-not-exist/messages`);
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe('Context not found');
  });

  it('S4 — limit returns the most recent N in chronological order', async () => {
    const { base } = await startTestServer();
    insertMessage('user', 'm1');
    insertMessage('user', 'm2');
    insertMessage('user', 'm3');
    insertMessage('user', 'm4');
    insertMessage('user', 'm5');

    const res = await fetch(`${base}/api/contexts/main/messages?limit=2`);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(2);
    expect(body[0].content).toBe('m4');
    expect(body[1].content).toBe('m5');
  });

  it('S5 — only the requested context\'s messages are returned', async () => {
    const { base } = await startTestServer();
    db.prepare("INSERT INTO contexts (id, name) VALUES ('work', 'Work')").run();
    insertMessage('user', 'work msg', 'work');
    insertMessage('user', 'main msg');

    const res = await fetch(`${base}/api/contexts/main/messages`);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(1);
    expect(body[0].content).toBe('main msg');
  });
});

describe('GET /api/logs', () => {
  beforeEach(() => {
    createOperationalLogsTable();
  });

  it('S1 — returns persisted logs mapped to LogRecord shape', async () => {
    const { base } = await startTestServer();
    insertLog(40, 'disk slow', 'scheduler');

    const res = await fetch(`${base}/api/logs?level=info`);
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
    const { base } = await startTestServer();
    insertLog(30, 'i');
    insertLog(50, 'e');

    const res = await fetch(`${base}/api/logs?level=error`);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(1);
    expect(body[0].message).toBe('e');
  });

  it('S3 — default level is info and returns chronological order', async () => {
    const { base } = await startTestServer();
    insertLog(30, 'first');
    insertLog(40, 'second');

    const res = await fetch(`${base}/api/logs`);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(2);
    expect(body[0].message).toBe('first');
    expect(body[0].level).toBe('info');
    expect(body[1].message).toBe('second');
    expect(body[1].level).toBe('warn');
  });

  it('S4 — limit returns the most recent N in chronological order', async () => {
    const { base } = await startTestServer();
    for (let i = 0; i < 5; i++) {
      insertLog(30, `log-${i}`);
    }

    const res = await fetch(`${base}/api/logs?limit=2`);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body.length).toBe(2);
    expect(body[0].message).toBe('log-3');
    expect(body[1].message).toBe('log-4');
  });

  it('S5 — empty table returns empty array', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/logs`);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(body).toEqual([]);
  });
});
