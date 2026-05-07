import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('WhatsApp and Signal real pino logger', () => {
  // We test by checking whether the adapter uses a real pino child logger
  // rather than the old no-op object.
  // We do this by inspecting the baileysLogger that WhatsApp creates.

  it('WhatsApp creates a pino child logger (not a no-op) for Baileys', async () => {
    // The WhatsApp adapter constructs a baileysLogger. After our change,
    // this should be a real pino child logger — detectable by having .bindings()
    // (which pino child loggers have) and a real level property.
    vi.resetModules();

    const { getLogger } = await import('@src/observability/logger.js');
    const logger = getLogger();
    const childSpy = vi.spyOn(logger, 'child');

    // Import WhatsApp adapter — this triggers module-level setup
    // We can't easily instantiate it without WA dependencies, so we just
    // check the import doesn't use a no-op pattern by verifying the
    // getLogger child call signature in the module.
    const whatsappSrc = await import('fs').then(({ readFileSync }) =>
      readFileSync(new URL('../../src/channels/whatsapp.ts', import.meta.url).pathname, 'utf-8')
    );

    // Should reference getLogger and .child({ component: 'whatsapp' })
    expect(whatsappSrc).toContain("component: 'whatsapp'");
    // Should NOT have the old no-op pattern
    expect(whatsappSrc).not.toContain('trace: noop');
    expect(whatsappSrc).not.toContain('{ trace:');
    expect(whatsappSrc).not.toContain('debug: () =>');
  });

  it('Signal adapter uses a module-level pino child logger (not per-call getLogger)', async () => {
    const signalSrc = await import('fs').then(({ readFileSync }) =>
      readFileSync(new URL('../../src/channels/signal.ts', import.meta.url).pathname, 'utf-8')
    );

    // Must have a child logger assigned at module level
    expect(signalSrc).toContain(".child({ component: 'signal' })");
    // Must NOT call getLogger() on every log call (no per-call pattern like getLogger().warn(...))
    expect(signalSrc).not.toMatch(/getLogger\(\)\.(warn|error|info|debug|fatal)\s*\(/);
  });

  it('WhatsApp adapter imports and uses getLogger', async () => {
    const whatsappSrc = await import('fs').then(({ readFileSync }) =>
      readFileSync(new URL('../../src/channels/whatsapp.ts', import.meta.url).pathname, 'utf-8')
    );

    expect(whatsappSrc).toContain('getLogger');
    expect(whatsappSrc).not.toMatch(/\bdebug:\s*\(\s*\)\s*=>/); // no no-op debug
  });
});
