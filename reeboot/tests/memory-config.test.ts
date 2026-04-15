import { describe, it, expect } from 'vitest';
import { ConfigSchema } from '../src/config.js';

describe('memory config schema', () => {
  it('applies defaults when no memory key is present', () => {
    const config = ConfigSchema.parse({});
    expect(config.memory.enabled).toBe(true);
    expect(config.memory.memoryCharLimit).toBe(2200);
    expect(config.memory.userCharLimit).toBe(1375);
    expect(config.memory.consolidation.enabled).toBe(true);
    expect(config.memory.consolidation.schedule).toBe('0 2 * * *');
  });

  it('respects explicit memory.enabled and memoryCharLimit overrides', () => {
    const config = ConfigSchema.parse({
      memory: {
        enabled: true,
        memoryCharLimit: 1000,
      },
    });
    expect(config.memory.enabled).toBe(true);
    expect(config.memory.memoryCharLimit).toBe(1000);
    // non-overridden values still default
    expect(config.memory.userCharLimit).toBe(1375);
    expect(config.memory.consolidation.enabled).toBe(true);
    expect(config.memory.consolidation.schedule).toBe('0 2 * * *');
  });

  it('respects consolidation schedule override', () => {
    const config = ConfigSchema.parse({
      memory: {
        consolidation: {
          schedule: '0 3 * * 1',
        },
      },
    });
    expect(config.memory.consolidation.schedule).toBe('0 3 * * 1');
  });

  it('respects memory.enabled: false', () => {
    const config = ConfigSchema.parse({
      memory: { enabled: false },
    });
    expect(config.memory.enabled).toBe(false);
  });
});
