import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runResilienceMigration, runObservabilityMigration } from '@src/db/schema.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
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

describe('OB-5-C: rate_limit_warning events row is inserted', () => {
  it('inserts rate_limit_warning event when remaining_tokens < 5000', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);
    makeObservabilityExtension(pi as any, db);

    pi.emit('after_provider_response', {
      contextId: 'main',
      provider: 'test-provider',
      headers: {
        'x-ratelimit-remaining-tokens': '3000', // below 5000 threshold
      },
    });
    await new Promise(r => setTimeout(r, 20));

    const event = db.prepare("SELECT * FROM events WHERE type = 'rate_limit_warning'").get() as any;
    expect(event).toBeDefined();
    const payload = JSON.parse(event.payload);
    expect(payload.remaining_tokens).toBe(3000);
  });

  it('does NOT insert rate_limit_warning event when remaining_tokens >= 5000', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);
    makeObservabilityExtension(pi as any, db);

    pi.emit('after_provider_response', {
      contextId: 'main',
      provider: 'test-provider',
      headers: {
        'x-ratelimit-remaining-tokens': '50000', // well above threshold
      },
    });
    await new Promise(r => setTimeout(r, 20));

    const event = db.prepare("SELECT * FROM events WHERE type = 'rate_limit_warning'").get();
    expect(event).toBeUndefined();
  });
});
