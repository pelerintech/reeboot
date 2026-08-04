import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '@src/config.js';

describe('memory.provider config', () => {
  it('defaults to builtin when unset', () => {
    const cfg = ConfigSchema.parse({});
    expect(cfg.memory.provider).toBe('builtin');
  });

  it('accepts an explicit dreem provider', () => {
    const cfg = ConfigSchema.parse({ memory: { provider: 'dreem', providerConfig: { baseUrl: 'http://x' } } });
    expect(cfg.memory.provider).toBe('dreem');
  });

  it('accepts an explicit mem0 provider', () => {
    const cfg = ConfigSchema.parse({ memory: { provider: 'mem0' } });
    expect(cfg.memory.provider).toBe('mem0');
  });

  it('rejects an unknown provider value', () => {
    const res = ConfigSchema.safeParse({ memory: { provider: 'foo' } });
    expect(res.success).toBe(false);
  });
});
