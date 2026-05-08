import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runResilienceMigration, runObservabilityMigration } from '@src/db/schema.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runResilienceMigration(db);
  runObservabilityMigration(db);
  return db;
}

function makePi(db: Database.Database) {
  const handlers: Record<string, Function[]> = {};
  return {
    on(event: string, handler: Function) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    emit(event: string, ...args: any[]) {
      for (const h of handlers[event] ?? []) h(...args);
    },
  };
}

describe('Observability extension — session lifecycle', () => {
  it('session_shutdown with reason=quit inserts a session_events row', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);
    makeObservabilityExtension(pi as any, db);

    pi.emit('session_shutdown', { reason: 'quit', contextId: 'main' });
    await new Promise(r => setTimeout(r, 20));

    const row = db.prepare("SELECT * FROM session_events LIMIT 1").get() as any;
    expect(row).toBeDefined();
    expect(row.reason).toBe('quit');
    expect(row.context_id).toBe('main');
    expect(row.linked_turn_id).toBeNull();
  });

  it('session_shutdown while turn is open sets reason=crash and linked_turn_id', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);
    makeObservabilityExtension(pi as any, db);

    // Insert an open turn journal row
    db.prepare(
      `INSERT INTO turn_journal (turn_id, context_id, prompt) VALUES ('open-turn-1', 'main', 'test prompt')`
    ).run();

    pi.emit('session_shutdown', { reason: 'quit', contextId: 'main' });
    await new Promise(r => setTimeout(r, 20));

    const row = db.prepare("SELECT * FROM session_events LIMIT 1").get() as any;
    expect(row).toBeDefined();
    expect(row.reason).toBe('crash');
    expect(row.linked_turn_id).toBe('open-turn-1');
  });

  it('session_shutdown with no open turns sets reason as-is with no linked_turn_id', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);
    makeObservabilityExtension(pi as any, db);

    pi.emit('session_shutdown', { reason: 'reload', contextId: 'main' });
    await new Promise(r => setTimeout(r, 20));

    const row = db.prepare("SELECT * FROM session_events LIMIT 1").get() as any;
    expect(row.reason).toBe('reload');
    expect(row.linked_turn_id).toBeNull();
  });

  it('session_path is stored when provided', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);
    makeObservabilityExtension(pi as any, db);

    pi.emit('session_shutdown', { reason: 'quit', contextId: 'main', targetSessionFile: '/tmp/session.jsonl' });
    await new Promise(r => setTimeout(r, 20));

    const row = db.prepare("SELECT * FROM session_events LIMIT 1").get() as any;
    expect(row.session_path).toBe('/tmp/session.jsonl');
  });
});
