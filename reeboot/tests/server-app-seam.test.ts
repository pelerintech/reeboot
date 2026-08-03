import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { openDatabase } from '../src/db/index.js';
import type { buildApp as BuildAppFn } from '../src/server.js';

let buildApp: typeof BuildAppFn;
let stopServer: () => Promise<void>;
let app: any;
let reebotDir: string;
let db: any;

beforeAll(async () => {
  reebotDir = mkdtempSync(join(tmpdir(), 'reeboot-seam-'));
  db = openDatabase(join(reebotDir, 'reeboot.db'));
  const mod = await import('../src/server.js');
  buildApp = mod.buildApp;
  stopServer = mod.stopServer;
});

afterAll(async () => {
  try { await stopServer(); } catch { /* ignore */ }
  db?.close();
});

describe('buildApp seam (socket-free real app)', () => {
  it('exports buildApp and drives /api/health without a socket', async () => {
    app = await buildApp({ db, reebotDir });
    const res = await app.request('http://localhost/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.version).toBe('string');
  });

  it('lists contexts and persists a POST /api/contexts to a follow-up GET', async () => {
    const before = await app.request('http://localhost/api/contexts');
    expect(before.status).toBe(200);
    const beforeBody = await before.json();
    expect(Array.isArray(beforeBody)).toBe(true);

    const post = await app.request('http://localhost/api/contexts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'seam-context' }),
    });
    expect(post.status).toBe(201);

    const after = await app.request('http://localhost/api/contexts');
    const afterBody = await after.json();
    const names = afterBody.map((c: any) => c.name);
    expect(names).toContain('seam-context');
  });

  it('returns 404 for an unknown route via the real notFound handler', async () => {
    const res = await app.request('http://localhost/api/does-not-exist-xyz');
    expect(res.status).toBe(404);
  });
});
