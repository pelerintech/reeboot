/**
 * Task REST API tests (Hono version)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';

// Mock node-cron to prevent real job scheduling
vi.mock('node-cron', () => ({
  default: { schedule: vi.fn(() => ({ stop: vi.fn() })), validate: vi.fn((e: string) => e !== 'not-cron') },
  schedule: vi.fn(() => ({ stop: vi.fn() })),
  validate: vi.fn((e: string) => e !== 'not-cron'),
}));

let startServer: any;
let stopServer: any;
let tmpDir: string;
let db: Database.Database;

beforeEach(async () => {
  vi.resetModules();

  tmpDir = join(tmpdir(), `reeboot-task-api-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model_provider TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      context_id TEXT NOT NULL REFERENCES contexts(id),
      schedule TEXT NOT NULL,
      prompt TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare("INSERT INTO contexts (id, name) VALUES ('main', 'main')").run();

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

describe('GET /api/tasks', () => {
  it('returns 200 with empty array', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/tasks`);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns existing tasks', async () => {
    db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt) VALUES ('t1', 'main', '* * * * *', 'Test prompt')"
    ).run();

    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/tasks`);
    const body = await res.json() as any[];
    expect(body.some((t: any) => t.id === 't1')).toBe(true);
  });
});

describe('POST /api/tasks', () => {
  it('creates task and returns 201', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/tasks`, {
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
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/tasks`, {
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
    const { base } = await startTestServer();
    await fetch(`${base}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contextId: 'main',
        schedule: '0 18 * * *',
        prompt: 'Evening summary',
      }),
    });

    const task = db.prepare("SELECT * FROM tasks WHERE prompt = 'Evening summary'").get();
    expect(task).toBeDefined();
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('removes task and returns 204', async () => {
    db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt) VALUES ('del1', 'main', '* * * * *', 'Delete me')"
    ).run();

    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/tasks/del1`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    const task = db.prepare("SELECT * FROM tasks WHERE id = 'del1'").get();
    expect(task).toBeUndefined();
  });

  it('returns 404 for unknown id', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/tasks/nonexistent`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('deleted task does not appear in GET /api/tasks', async () => {
    db.prepare(
      "INSERT INTO tasks (id, context_id, schedule, prompt) VALUES ('del2', 'main', '* * * * *', 'Gone')"
    ).run();

    const { base } = await startTestServer();
    await fetch(`${base}/api/tasks/del2`, { method: 'DELETE' });

    const res = await fetch(`${base}/api/tasks`);
    const body = await res.json() as any[];
    expect(body.some((t: any) => t.id === 'del2')).toBe(false);
  });
});
