import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { buildWebhookApp } from '../../src/webhooks.js';
import type { WebhooksConfig } from '../../src/config.js';

function sig(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('webhook deliver + sync modes', () => {
  it('deliver mode sends the result to the channel+peer and acks the caller', async () => {
    const webhooks: WebhooksConfig = [
      { name: 'd', secret: 's', prompt: 'Do {body}', enabled: true, deliver: { channel: 'whatsapp', peer: '+15551234567' } },
    ];
    const delivered: Array<{ channel: string; peer?: string; text: string }> = [];
    const app = buildWebhookApp(webhooks, {
      runTask: async () => ({ ok: true, result: 'result-text' }),
      deliver: async (target, text) => { delivered.push({ channel: target.channel, peer: target.peer, text }); },
    });

    const body = '{"x":1}';
    const res = await app.request(new Request('http://localhost/d', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', 'x-reeboot-signature': sig('s', body) },
    }));

    expect(res.status).toBe(200);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].channel).toBe('whatsapp');
    expect(delivered[0].peer).toBe('+15551234567');
    expect(delivered[0].text).toContain('result-text');
  });

  it('no-deliver mode returns the result synchronously as JSON', async () => {
    const webhooks: WebhooksConfig = [
      { name: 's', secret: 's', prompt: 'Do {body}', enabled: true },
    ];
    const app = buildWebhookApp(webhooks, {
      runTask: async () => ({ ok: true, result: 'sync-answer' }),
    });

    const body = '{"x":1}';
    const res = await app.request(new Request('http://localhost/s', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json', 'x-reeboot-signature': sig('s', body) },
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toBe('sync-answer');
  });
});
