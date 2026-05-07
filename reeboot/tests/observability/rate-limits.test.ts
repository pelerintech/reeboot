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

describe('Observability extension — rate limits (after_provider_response)', () => {
  it('inserts rate_limits row when x-ratelimit-remaining-tokens header is present', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);
    // configProvider mirrors what the loader passes from config.agent.model.provider
    makeObservabilityExtension(pi as any, db, { configProvider: 'test-provider' });

    pi.emit('after_provider_response', {
      contextId: 'main',
      headers: {
        'x-ratelimit-remaining-tokens': '5000',
        'x-ratelimit-remaining-requests': '100',
      },
    });
    await new Promise(r => setTimeout(r, 20));

    const row = db.prepare('SELECT * FROM rate_limits LIMIT 1').get() as any;
    expect(row).toBeDefined();
    expect(row.remaining_tokens).toBe(5000);
    expect(row.remaining_requests).toBe(100);
    expect(row.provider).toBe('test-provider');
  });

  it('parses retry-after header to milliseconds', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);
    makeObservabilityExtension(pi as any, db);

    pi.emit('after_provider_response', {
      contextId: 'main',
      provider: 'test-provider',
      headers: {
        'x-ratelimit-remaining-tokens': '100',
        'retry-after': '10', // 10 seconds
      },
    });
    await new Promise(r => setTimeout(r, 20));

    const row = db.prepare('SELECT * FROM rate_limits LIMIT 1').get() as any;
    expect(row.retry_after_ms).toBe(10000);
  });

  it('does NOT insert a row when no rate limit headers are present', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);
    makeObservabilityExtension(pi as any, db);

    pi.emit('after_provider_response', {
      contextId: 'main',
      provider: 'ollama',
      headers: {},
    });
    await new Promise(r => setTimeout(r, 20));

    const rows = db.prepare('SELECT * FROM rate_limits').all();
    expect(rows).toHaveLength(0);
  });

  it('does NOT throw when headers are missing entirely', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);

    expect(() => {
      makeObservabilityExtension(pi as any, db);
      pi.emit('after_provider_response', { contextId: 'main', provider: 'local' });
    }).not.toThrow();
  });

  it('getLatestRateLimit returns most recent row for provider', async () => {
    vi.resetModules();
    const { makeObservabilityExtension, getLatestRateLimit } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);
    // configProvider must match what the scheduler uses for lookup
    makeObservabilityExtension(pi as any, db, { configProvider: 'test-provider' });

    pi.emit('after_provider_response', {
      contextId: 'main',
      headers: { 'x-ratelimit-remaining-tokens': '1000' },
    });
    await new Promise(r => setTimeout(r, 20));

    const row = getLatestRateLimit(db, 'test-provider');
    expect(row).not.toBeNull();
    expect(row!.remaining_tokens).toBe(1000);
  });

  it('getLatestRateLimit returns null when no rows for provider', async () => {
    vi.resetModules();
    const { getLatestRateLimit } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const result = getLatestRateLimit(db, 'nonexistent-provider');
    expect(result).toBeNull();
  });
});
