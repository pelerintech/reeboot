import { describe, it, expect } from 'vitest';

/**
 * zod 4 compatibility guard for the project's own config schemas.
 *
 * The root dependency was moved from zod ^3 to zod ^4 (ci-zod4-fix). src/config.ts
 * is the only own-code consumer of zod, and it uses only vanilla APIs
 * (z.object/.string/.enum/.number/.int/.boolean/.array/.default). This test locks
 * that the schema parses cleanly under the installed zod major (v4) and that
 * unknown/README-invalid inputs are still rejected.
 */
describe('ConfigSchema under the installed zod (v4)', () => {
  it('parses {} into the full default shape', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const cfg = ConfigSchema.parse({});
    expect(cfg.sdk).toBe('pi');
    expect(cfg.agent).toBeDefined();
    expect(cfg.channels).toBeDefined();
    expect(cfg.logging).toBeDefined();
    expect(cfg.extensions).toBeDefined();
  });

  it('parses a representative full (ree) config', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    const raw = {
      sdk: 'ree',
      agent: { name: 'SupportBot' },
      ree: {
        model: { provider: 'openai', id: 'gpt-4o' },
      },
      channels: { web: { enabled: true, port: 4000 } },
      logging: { level: 'info' },
    };
    const cfg = ConfigSchema.parse(raw);
    expect(cfg.sdk).toBe('ree');
    expect(cfg.agent.name).toBe('SupportBot');
    expect(cfg.channels.web.port).toBe(4000);
    expect(cfg.logging.level).toBe('info');
  });

  it('rejects an invalid value via safeParse', async () => {
    const { ConfigSchema } = await import('@src/config.js');
    // sdk is an enum of 'pi'|'ree'; any other value must be rejected.
    const result = ConfigSchema.safeParse({ sdk: 'not-a-sdk' });
    expect(result.success).toBe(false);
  });

  it('exports defaultConfig without throwing', async () => {
    const { defaultConfig } = await import('@src/config.js');
    expect(defaultConfig.sdk).toBe('pi');
  });
});
