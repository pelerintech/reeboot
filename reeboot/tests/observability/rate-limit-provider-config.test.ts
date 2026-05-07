/**
 * OB-5-A: rate_limits.provider must be "the model provider string from config",
 * not the event.provider field.
 *
 * The observability extension should accept a configProvider option and use it
 * when recording rate limit rows, regardless of what event.provider says.
 */
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runResilienceMigration, runObservabilityMigration } from '@src/db/schema.js';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  runResilienceMigration(db);
  runObservabilityMigration(db);
  return db;
}

function makePi() {
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

describe('OB-5-A: rate_limits.provider comes from config, not event.provider', () => {
  it('records config provider when event.provider differs', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi();

    // Pass configProvider = 'test-provider' from config
    makeObservabilityExtension(pi as any, db, { configProvider: 'test-provider' });

    // Fire event with a different (or missing) provider field
    pi.emit('after_provider_response', {
      contextId: 'main',
      provider: 'some-other-value',  // should be ignored in favour of configProvider
      headers: {
        'x-ratelimit-remaining-tokens': '50000',
      },
    });

    const row = db.prepare('SELECT * FROM rate_limits').get() as any;
    expect(row).toBeDefined();
    // Provider must be 'test-provider' (from config), NOT 'some-other-value' (from event)
    expect(row.provider).toBe('test-provider');
  });

  it('falls back to "unknown" when no configProvider and no event.provider', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi();

    // No configProvider option, no event.provider
    makeObservabilityExtension(pi as any, db);

    pi.emit('after_provider_response', {
      contextId: 'main',
      headers: { 'x-ratelimit-remaining-tokens': '50000' },
    });

    const row = db.prepare('SELECT * FROM rate_limits').get() as any;
    expect(row).toBeDefined();
    expect(row.provider).toBe('unknown');
  });

  it('getLatestRateLimit finds the row using config provider', async () => {
    vi.resetModules();
    const { makeObservabilityExtension, getLatestRateLimit } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi();

    makeObservabilityExtension(pi as any, db, { configProvider: 'test-provider' });

    pi.emit('after_provider_response', {
      contextId: 'main',
      headers: { 'x-ratelimit-remaining-tokens': '50000' },
    });

    // Scheduler queries with the same config provider
    const row = getLatestRateLimit(db, 'test-provider');
    expect(row).not.toBeNull();
    expect(row!.remaining_tokens).toBe(50000);

    // Querying with 'unknown' should find nothing
    const missing = getLatestRateLimit(db, 'unknown');
    expect(missing).toBeNull();
  });
});
