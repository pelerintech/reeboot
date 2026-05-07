import { describe, it, expect } from 'vitest';

describe('pino logger singleton', () => {
  it('createLogger returns a pino instance with standard log methods', async () => {
    const { createLogger } = await import('@src/observability/logger.js');
    const logger = createLogger({ level: 'info' });

    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.fatal).toBe('function');
  });

  it('createLogger respects configured level', async () => {
    const { createLogger } = await import('@src/observability/logger.js');
    const logger = createLogger({ level: 'warn' });
    expect(logger.level).toBe('warn');
  });

  it('getLogger returns the same singleton instance', async () => {
    const { getLogger, initLogger } = await import('@src/observability/logger.js');
    initLogger({ level: 'info' });
    const a = getLogger();
    const b = getLogger();
    expect(a).toBe(b);
  });

  it('child logger inherits parent methods', async () => {
    const { createLogger } = await import('@src/observability/logger.js');
    const logger = createLogger({ level: 'info' });
    const child = logger.child({ component: 'test' });
    expect(typeof child.info).toBe('function');
    expect(typeof child.warn).toBe('function');
  });
});
