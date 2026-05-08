import { describe, it, expect } from 'vitest';

describe('OB-6-A: pino logs feed into sseEmitter', () => {
  it('a pino log record emitted via getLogger() appears in sseEmitter', async () => {
    // We need the logger to be wired to sseEmitter so that every pino log
    // record (not just audit events) appears in the SSE stream.
    const { initLogger } = await import('@src/observability/logger.js');
    const { sseEmitter } = await import('@src/observability/sse-emitter.js');

    const received: unknown[] = [];
    const listener = (r: unknown) => received.push(r);
    sseEmitter.on('log', listener);

    // Create a logger wired to sseEmitter
    const logger = initLogger({ level: 'debug' });

    // Emit a log record
    logger.warn({ component: 'test' }, 'pino-to-sse test record');

    // Give async write time to flush
    await new Promise(r => setTimeout(r, 50));

    sseEmitter.off('log', listener);

    expect(received.length).toBeGreaterThan(0);
    const record = received[0] as any;
    expect(record.msg).toBe('pino-to-sse test record');
    expect(record.level).toBeGreaterThanOrEqual(40); // warn = 40
  });
});
