/**
 * Generic inbound webhook triggers.
 *
 * One primitive: a webhook subscription = a trusted inbound event → an agent run.
 * A subscription is a configuration of that primitive — notify (A), act+deliver
 * (A+B), or B-side workflow entry (B) differ only in prompt + deliver target.
 *
 * The route is a standalone Hono sub-app (`buildWebhookApp`) so it can be mounted
 * by the server with real deps and tested in isolation with fake deps.
 */

import { Hono } from 'hono';
import crypto from 'node:crypto';
import type { WebhooksConfig, WebhookSubscription } from './config.js';

export interface WebhookDeliverTarget {
  channel: string;
  peer?: string;
}

export interface WebhookDeps {
  /** Run an agent task; returns the text result. */
  runTask(
    prompt: string,
    opts?: { timeoutMs?: number }
  ): Promise<{ ok: boolean; result: string; error?: string }>;
  /** Optional: deliver a result to a channel+peer (deliver mode). */
  deliver?: (target: WebhookDeliverTarget, text: string) => Promise<void>;
}

/** HMAC-SHA256 verification of the raw body, constant-time compared. */
export function verifySignature(
  secret: string,
  rawBody: string,
  signature: string | undefined
): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Map the POST body to prompt context (event-agnostic seam; default = JSON string). */
export function buildContext(bodyText: string, _sub: WebhookSubscription): string {
  try {
    return JSON.stringify(JSON.parse(bodyText));
  } catch {
    return bodyText;
  }
}

/**
 * Build the webhook sub-app. Mount at `/webhook` (i.e. routes become
 * `/webhook/:name`). 404 for unknown/disabled; 401 for bad signature; delivers
 * or returns the result based on the subscription's `deliver` target.
 */
export function buildWebhookApp(webhooks: WebhooksConfig, deps: WebhookDeps): Hono {
  const app = new Hono();

  app.post('/:name', async (c) => {
    const name = c.req.param('name');
    const sub = webhooks.find((w) => w.name === name);
    if (!sub || sub.enabled === false) {
      return c.json({ error: 'Not found' }, 404);
    }

    const raw = await c.req.text();
    const provided = c.req.header('x-reeboot-signature');
    if (!verifySignature(sub.secret, raw, provided)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const context = buildContext(raw, sub);
    const prompt = sub.prompt.replace(/\{body\}/g, context);
    const out = await deps.runTask(prompt);

    if (sub.deliver && deps.deliver) {
      await deps.deliver({ channel: sub.deliver.channel, peer: sub.deliver.peer }, out.result || out.error || '');
      return c.json({ status: 'accepted' });
    }

    if (!out.ok) {
      return c.json({ status: 'failed', error: out.error }, 500);
    }
    return c.json({ result: out.result });
  });

  return app;
}
