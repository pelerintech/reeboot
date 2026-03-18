/**
 * REST API tests (5.1) — /api/contexts routes
 */

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
  tmpDir = join(tmpdir(), `reeboot-rest-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
  db = new Database(join(tmpDir, 'test.db'));

  vi.resetModules();
  ({ startServer, stopServer } = await import('./server.js'));
});

afterEach(async () => {
  try { await stopServer(); } catch { /* ignore */ }
  try { db.close(); } catch { /* ignore */ }
  rmSync(tmpDir, { recursive: true, force: true });
});

async function startTestServer() {
  const server = await startServer({ port: 0, logLevel: 'silent', db, reebotDir: tmpDir });
  const address = server.addresses()[0];
  const base = `http://localhost:${address.port}`;
  return { server, base };
}

describe('GET /api/contexts', () => {
  it('returns an array (may be empty or have main)', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/contexts`);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns main context after server starts', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/contexts`);
    const body = await res.json() as any[];
    const main = body.find((c: any) => c.id === 'main');
    expect(main).toBeDefined();
  });
});

describe('POST /api/contexts', () => {
  it('creates context and returns 201 with context object', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/contexts`, {
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
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/contexts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_provider: 'anthropic' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBeDefined();
  });

  it('new context appears in GET /api/contexts list', async () => {
    const { base } = await startTestServer();
    await fetch(`${base}/api/contexts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'personal', model_provider: 'anthropic', model_id: 'claude-sonnet-4-20250514' }),
    });
    const res = await fetch(`${base}/api/contexts`);
    const list = await res.json() as any[];
    expect(list.some((c: any) => c.name === 'personal')).toBe(true);
  });
});

describe('GET /api/contexts/:id/sessions', () => {
  it('returns 200 with array for existing context', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/contexts/main/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json() as any[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('returns 404 for unknown context', async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/api/contexts/nonexistent/sessions`);
    expect(res.status).toBe(404);
  });
});
