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

describe('POST /webhook/:name (route registration)', () => {
  const deps = { runTask: async () => ({ ok: true, result: 'done' }) };
  const webhooks: WebhooksConfig = [
    { name: 'known', secret: 's3cret', prompt: 'Do: {body}', enabled: true },
    { name: 'off', secret: 's', prompt: 'Do: {body}', enabled: false },
  ];

  it('returns non-404 for a known enabled subscription with a valid signature', async () => {
    const app = buildWebhookApp(webhooks, deps);
    const res = await post(app, 'known', '{"a":1}', sig('s3cret', '{"a":1}'));
    expect(res.status).not.toBe(404);
  });

  it('returns 404 for an unknown subscription', async () => {
    const app = buildWebhookApp(webhooks, deps);
    const res = await post(app, 'unknown', '{}', sig('s3cret', '{}'));
    expect(res.status).toBe(404);
  });

  it('returns 404 for a disabled subscription', async () => {
    const app = buildWebhookApp(webhooks, deps);
    const res = await post(app, 'off', '{}', sig('s', '{}'));
    expect(res.status).toBe(404);
  });
});
