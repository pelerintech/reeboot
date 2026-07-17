/**
 * Spec: events-retention-bound (config surface)
 * `LoggingConfigSchema` declares `events_info_retention_days` (default 7) and
 * `events_max_rows_per_context` (default 8000), with explicit values round-tripping.
 */
import { describe, it, expect } from 'vitest';

describe('config: events retention + row-cap fields', () => {
  it('defaults: events_info_retention_days=7, events_max_rows_per_context=8000', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({});
    expect(cfg.logging.events_info_retention_days).toBe(7);
    expect(cfg.logging.events_max_rows_per_context).toBe(8000);
  });

  it('explicit values round-trip', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({
      logging: { events_info_retention_days: 3, events_max_rows_per_context: 2000 },
    });
    expect(cfg.logging.events_info_retention_days).toBe(3);
    expect(cfg.logging.events_max_rows_per_context).toBe(2000);
  });
});
