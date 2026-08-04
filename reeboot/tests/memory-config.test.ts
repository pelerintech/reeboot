import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '../src/config.js';

describe('memory config schema — discriminated union on provider', () => {
  it('applies builtin defaults when no memory key is present', () => {
    const config = ConfigSchema.parse({});
    expect(config.memory.provider).toBe('builtin');
    expect(config.memory.enabled).toBe(true);
    expect(config.memory.providerConfig.memoryCharLimit).toBe(2200);
    expect(config.memory.providerConfig.userCharLimit).toBe(1375);
    expect(config.memory.providerConfig.consolidation.enabled).toBe(true);
    expect(config.memory.providerConfig.consolidation.schedule).toBe('0 2 * * *');
  });

  it("provider:'builtin' with no providerConfig parses via defaults", () => {
    const config = ConfigSchema.parse({ memory: { provider: 'builtin' } });
    expect(config.memory.provider).toBe('builtin');
    expect(config.memory.enabled).toBe(true);
    expect(config.memory.providerConfig.memoryCharLimit).toBe(2200);
    expect(config.memory.providerConfig.consolidation.enabled).toBe(true);
  });

  it('builtin branch validates its own typed providerConfig', () => {
    const config = ConfigSchema.parse({
      memory: {
        provider: 'builtin',
        enabled: true,
        providerConfig: {
          memoryCharLimit: 1000,
          userCharLimit: 500,
          consolidation: { schedule: '0 3 * * 1' },
        },
      },
    });
    expect(config.memory.providerConfig.memoryCharLimit).toBe(1000);
    expect(config.memory.providerConfig.userCharLimit).toBe(500);
    expect(config.memory.providerConfig.consolidation.schedule).toBe('0 3 * * 1');
  });

  it('dreem branch validates required baseUrl + optional fields', () => {
    const config = ConfigSchema.parse({
      memory: {
        provider: 'dreem',
        providerConfig: {
          baseUrl: 'http://localhost:8787',
          apiKey: 'secret',
          consolidationInterval: '0 * * * *',
          llm: { provider: 'anthropic', id: 'claude-x' },
        },
      },
    });
    expect(config.memory.provider).toBe('dreem');
    expect(config.memory.providerConfig.baseUrl).toBe('http://localhost:8787');
    expect(config.memory.providerConfig.apiKey).toBe('secret');
    expect(config.memory.providerConfig.consolidationInterval).toBe('0 * * * *');
    expect(config.memory.providerConfig.llm).toEqual({ provider: 'anthropic', id: 'claude-x' });
  });

  it('rejects an unknown provider', () => {
    expect(() => ConfigSchema.parse({ memory: { provider: 'nope' } })).toThrow();
  });

  it('rejects a dreem branch missing the required baseUrl', () => {
    expect(() => ConfigSchema.parse({ memory: { provider: 'dreem', providerConfig: {} } })).toThrow();
  });

  it('accepts a legacy flat memory block (no provider key) as builtin', () => {
    // Pre-discriminated-union configs stored builtin fields flat at `memory.*`
    // with no `provider` key — these must still parse (backward compatibility).
    const config = ConfigSchema.parse({
      memory: {
        enabled: true,
        memoryCharLimit: 1600,
        userCharLimit: 900,
        consolidation: { enabled: true, schedule: '0 4 * * *' },
      },
    });
    expect(config.memory.provider).toBe('builtin');
    expect(config.memory.providerConfig.memoryCharLimit).toBe(1600);
    expect(config.memory.providerConfig.userCharLimit).toBe(900);
    expect(config.memory.providerConfig.consolidation.schedule).toBe('0 4 * * *');
  });
});
