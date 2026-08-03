import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { buildWebhookApp } from '../../src/webhooks.js';
import type { WebhooksConfig } from '../../src/config.js';

function sig(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('body → prompt context + agent run', () => {
  it('maps the JSON body into the prompt template and runs the agent', async () => {
    const webhooks: WebhooksConfig = [
      { name: 't', secret: 's', prompt: 'Classify ticket #{body}', enabled: true },
    ];
    const seen: string[] = [];
    const app = buildWebhookApp(webhooks, {
      runTask: async (prompt) => { seen.push(prompt); return { ok: true, result: 'triaged' }; },
    });

    const body = '{"id": 42, "title": "DB down"}';
    const res = await app.request(new Request('http://localhost/t', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', 'x-reeboot-signature': sig('s', body) },
    }));

    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('Classify ticket #{"id":42,"title":"DB down"}');
  });
});
