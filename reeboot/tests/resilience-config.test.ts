import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

describe('resilience config', () => {
  it('returns safe_only default recovery mode when no config file supplied', async () => {
    const { loadConfig } = await import('@src/config.js');
    const cfg = loadConfig('/nonexistent/path/config.json');
    expect(cfg.resilience.recovery.mode).toBe('safe_only');
    expect(cfg.resilience.outage_threshold).toBe(3);
    expect(cfg.resilience.scheduler.catchup_window).toBe('1h');
  });

  it('returns defaults for side_effect_tools and probe_interval', async () => {
    const { loadConfig } = await import('@src/config.js');
    const cfg = loadConfig('/nonexistent/path/config.json');
    expect(cfg.resilience.recovery.side_effect_tools).toEqual([]);
    expect(cfg.resilience.probe_interval).toBe('1h');
  });

  it('round-trips a full resilience block', async () => {
    const { loadConfig } = await import('@src/config.js');
    const { mkdtempSync, writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const tmp = mkdtempSync(join(tmpdir(), 'reeboot-res-'));
    const cfgPath = join(tmp, 'config.json');
    writeFileSync(cfgPath, JSON.stringify({
      resilience: {
        recovery: {
          mode: 'always',
          side_effect_tools: ['send_email', 'post_slack'],
        },
        scheduler: { catchup_window: '2h' },
        outage_threshold: 5,
        probe_interval: '30m',
      },
    }));
    const cfg = loadConfig(cfgPath);
    expect(cfg.resilience.recovery.mode).toBe('always');
    expect(cfg.resilience.recovery.side_effect_tools).toEqual(['send_email', 'post_slack']);
    expect(cfg.resilience.scheduler.catchup_window).toBe('2h');
    expect(cfg.resilience.outage_threshold).toBe(5);
    expect(cfg.resilience.probe_interval).toBe('30m');
  });

  it('throws ZodError for invalid recovery mode', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    expect(() => ConfigSchema.parse({
      resilience: { recovery: { mode: 'maybe' } },
    })).toThrow(ZodError);
  });
});
