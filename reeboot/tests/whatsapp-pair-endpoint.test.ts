/**
 * WhatsApp pairing/QR/reset endpoints (behavioral, socket-free).
 *
 * These routes require a configured WhatsApp adapter; with none configured they
 * must reject with 404 through the real route handler. The full pairing/QR
 * success flow (which needs mocked Baileys) is covered under the whatsapp
 * mocking task.
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

describe('POST /api/channels/whatsapp/pair', () => {
  it('returns 404 when the whatsapp channel is not configured', async () => {
    const res = await api('/api/channels/whatsapp/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+15551234567' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toMatch(/not configured/i);
  });
});

describe('POST /api/channels/whatsapp/qr', () => {
  it('returns 404 when the whatsapp channel is not configured', async () => {
    const res = await api('/api/channels/whatsapp/qr', { method: 'POST' });
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toMatch(/not configured/i);
  });
});

describe('POST /api/channels/whatsapp/reset', () => {
  it('returns 404 when the whatsapp channel is not configured', async () => {
    const res = await api('/api/channels/whatsapp/reset', { method: 'POST' });
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toMatch(/not configured/i);
  });
});
