import { describe, it, expect } from 'vitest';

describe('BudgetConfigSchema', () => {
  it('parses daily_cost_usd and warn_threshold', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({ budget: { daily_cost_usd: 5.0, warn_threshold: 0.9 } });
    expect(cfg.budget.daily_cost_usd).toBe(5.0);
    expect(cfg.budget.warn_threshold).toBe(0.9);
  });

  it('defaults all budget fields correctly when budget is absent', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({});
    expect(cfg.budget.daily_tokens).toBeNull();
    expect(cfg.budget.daily_cost_usd).toBeNull();
    expect(cfg.budget.session_tokens).toBeNull();
    expect(cfg.budget.session_cost_usd).toBeNull();
    expect(cfg.budget.turn_tokens).toBeNull();
    expect(cfg.budget.turn_cost_usd).toBeNull();
    expect(cfg.budget.warn_threshold).toBe(0.8);
  });
});
