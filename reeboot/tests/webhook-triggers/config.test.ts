import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '@src/config.js';

const validSub = (extra: Record<string, unknown> = {}) => ({
  name: 'ticket',
  secret: 's3cret',
  prompt: 'Classify this: {body}',
  enabled: true,
  ...extra,
});

describe('webhooks config schema', () => {
  it('parses a valid subscription without deliver', () => {
    const cfg = ConfigSchema.parse({ webhooks: [validSub()] });
    expect(cfg.webhooks).toHaveLength(1);
    expect(cfg.webhooks[0].name).toBe('ticket');
    expect(cfg.webhooks[0].secret).toBe('s3cret');
    expect(cfg.webhooks[0].enabled).toBe(true);
  });

  it('parses a subscription with a deliver target', () => {
    const cfg = ConfigSchema.parse({
      webhooks: [validSub({ deliver: { channel: 'whatsapp', peer: '+15551234567' } })],
    });
    expect(cfg.webhooks[0].deliver?.channel).toBe('whatsapp');
    expect(cfg.webhooks[0].deliver?.peer).toBe('+15551234567');
  });

  it('defaults webhooks to an empty array', () => {
    const cfg = ConfigSchema.parse({});
    expect(cfg.webhooks).toEqual([]);
  });

  it('rejects a subscription missing its secret', () => {
    const res = ConfigSchema.safeParse({ webhooks: [{ name: 'x', prompt: 'p' }] });
    expect(res.success).toBe(false);
  });
});
