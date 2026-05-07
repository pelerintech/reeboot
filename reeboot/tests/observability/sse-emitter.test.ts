import { describe, it, expect } from 'vitest';

describe('SSE emitter', () => {
  it('imports SseEmitter from the module', async () => {
    const mod = await import('@src/observability/sse-emitter.js');
    expect(typeof mod.SseEmitter).toBe('function');
  });

  it('sseEmitter singleton is exported', async () => {
    const { sseEmitter } = await import('@src/observability/sse-emitter.js');
    expect(sseEmitter).toBeDefined();
    expect(typeof sseEmitter.on).toBe('function');
    expect(typeof sseEmitter.off).toBe('function');
  });

  it('emitLogRecord triggers registered listeners', async () => {
    const { sseEmitter, emitLogRecord } = await import('@src/observability/sse-emitter.js');

    const received: unknown[] = [];
    const listener = (record: unknown) => received.push(record);
    sseEmitter.on('log', listener);

    const record = { level: 30, msg: 'hello', time: Date.now() };
    emitLogRecord(record);

    sseEmitter.off('log', listener);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(record);
  });

  it('multiple listeners all receive the record', async () => {
    const { sseEmitter, emitLogRecord } = await import('@src/observability/sse-emitter.js');

    const a: unknown[] = [];
    const b: unknown[] = [];
    const la = (r: unknown) => a.push(r);
    const lb = (r: unknown) => b.push(r);
    sseEmitter.on('log', la);
    sseEmitter.on('log', lb);

    emitLogRecord({ level: 40, msg: 'warn record' });

    sseEmitter.off('log', la);
    sseEmitter.off('log', lb);

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('after off, listener no longer receives records', async () => {
    const { sseEmitter, emitLogRecord } = await import('@src/observability/sse-emitter.js');

    const received: unknown[] = [];
    const listener = (r: unknown) => received.push(r);
    sseEmitter.on('log', listener);
    sseEmitter.off('log', listener);

    emitLogRecord({ level: 30, msg: 'silent' });

    expect(received).toHaveLength(0);
  });
});
