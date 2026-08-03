import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { buildWebhookApp } from '../../src/webhooks.js';
import type { WebhooksConfig } from '../../src/config.js';

function sig(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

async function post(app: any, name: string, body: string, signature?: string) {
  const req = new Request(`http://localhost/${name}`, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...(signature ? { 'x-reeboot-signature': signature } : {}) },
  });
  return app.request(req);
}

describe('HMAC authenticity for webhook triggers', () => {
  const webhooks: WebhooksConfig = [
    { name: 'h', secret: 'topsecret', prompt: 'Do: {body}', enabled: true },
  ];
  const runTask = async (prompt: string) => ({ ok: true, result: `ran:${prompt}` });
  const deps = { runTask };

  it('rejects a missing signature with 401 and does not run', async () => {
    const calls: string[] = [];
    const app = buildWebhookApp(webhooks, { runTask: async (p) => { calls.push(p); return { ok: true, result: '' }; } });
    const res = await post(app, 'h', '{"a":1}');
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('rejects an incorrect signature with 401', async () => {
    const app = buildWebhookApp(webhooks, deps);
    const res = await post(app, 'h', '{"a":1}', sig('wrong-secret', '{"a":1}'));
    expect(res.status).toBe(401);
  });

  it('accepts a correctly signed raw body', async () => {
    const app = buildWebhookApp(webhooks, deps);
    const res = await post(app, 'h', '{"a":1}', sig('topsecret', '{"a":1}'));
    expect(res.status).not.toBe(401);
  });
});
