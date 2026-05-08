import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runResilienceMigration, runObservabilityMigration } from '@src/db/schema.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runResilienceMigration(db);
  runObservabilityMigration(db);
  return db;
}

describe('emitEvent — audit event writer', () => {
  it('imports emitEvent from the module', async () => {
    const mod = await import('@src/observability/events.js');
    expect(typeof mod.emitEvent).toBe('function');
  });

  it('inserts a row into the events table', async () => {
    const { emitEvent } = await import('@src/observability/events.js');
    const db = makeDb();

    await emitEvent(db, { type: 'turn_started', contextId: 'main', severity: 9 });

    const row = db.prepare('SELECT * FROM events LIMIT 1').get() as any;
    expect(row).toBeDefined();
    expect(row.type).toBe('turn_started');
    expect(row.context_id).toBe('main');
    expect(row.severity).toBe(9);
  });

  it('generated id is a non-empty string', async () => {
    const { emitEvent } = await import('@src/observability/events.js');
    const db = makeDb();
    await emitEvent(db, { type: 'scheduler_fired', severity: 9 });
    const row = db.prepare('SELECT * FROM events LIMIT 1').get() as any;
    expect(typeof row.id).toBe('string');
    expect(row.id.length).toBeGreaterThan(0);
  });

  it('trace_id is 32-char hex', async () => {
    const { emitEvent } = await import('@src/observability/events.js');
    const db = makeDb();
    await emitEvent(db, { type: 'turn_started', severity: 9 });
    const row = db.prepare('SELECT * FROM events LIMIT 1').get() as any;
    expect(row.trace_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('span_id is 16-char hex', async () => {
    const { emitEvent } = await import('@src/observability/events.js');
    const db = makeDb();
    await emitEvent(db, { type: 'turn_started', severity: 9 });
    const row = db.prepare('SELECT * FROM events LIMIT 1').get() as any;
    expect(row.span_id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('created_ns is a positive integer', async () => {
    const { emitEvent } = await import('@src/observability/events.js');
    const db = makeDb();
    await emitEvent(db, { type: 'turn_started', severity: 9 });
    const row = db.prepare('SELECT * FROM events LIMIT 1').get() as any;
    expect(typeof row.created_ns).toBe('number');
    expect(row.created_ns).toBeGreaterThan(0);
  });

  it('payload is stored as JSON string', async () => {
    const { emitEvent } = await import('@src/observability/events.js');
    const db = makeDb();
    await emitEvent(db, { type: 'turn_completed', severity: 9, payload: { durationMs: 1234 } });
    const row = db.prepare('SELECT * FROM events LIMIT 1').get() as any;
    const payload = JSON.parse(row.payload);
    expect(payload.durationMs).toBe(1234);
  });

  it('emitEvent also calls sseEmitter so SSE subscribers receive the record', async () => {
    const { emitEvent } = await import('@src/observability/events.js');
    const { sseEmitter } = await import('@src/observability/sse-emitter.js');
    const db = makeDb();

    const received: unknown[] = [];
    const listener = (r: unknown) => received.push(r);
    sseEmitter.on('log', listener);

    await emitEvent(db, { type: 'turn_started', severity: 9 });

    sseEmitter.off('log', listener);
    expect(received.length).toBeGreaterThan(0);
  });
});
