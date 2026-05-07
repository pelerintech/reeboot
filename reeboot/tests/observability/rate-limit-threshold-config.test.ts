/**
 * OB-5-C: Rate limit warn threshold must be configurable.
 * A custom threshold passed to makeObservabilityExtension should override 5000.
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

describe('OB-5-C: rate_limit_warn_threshold is configurable', () => {
  it('uses a custom threshold of 1000 — warns when remaining_tokens < 1000', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);
    // Pass custom threshold of 1000
    makeObservabilityExtension(pi as any, db, { rateLimitWarnThreshold: 1000 });

    // 800 < 1000 → should trigger warning event
    pi.emit('after_provider_response', {
      contextId: 'main',
      provider: 'test-provider',
      headers: { 'x-ratelimit-remaining-tokens': '800' },
    });
    await new Promise(r => setTimeout(r, 20));

    const event = db.prepare("SELECT * FROM events WHERE type = 'rate_limit_warning'").get() as any;
    expect(event).toBeDefined();
    const payload = JSON.parse(event.payload);
    expect(payload.remaining_tokens).toBe(800);
  });

  it('uses a custom threshold of 1000 — does NOT warn when remaining_tokens >= 1000', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);
    // Pass custom threshold of 1000
    makeObservabilityExtension(pi as any, db, { rateLimitWarnThreshold: 1000 });

    // 2000 >= 1000 → should NOT trigger warning event (even though < default 5000)
    pi.emit('after_provider_response', {
      contextId: 'main',
      provider: 'test-provider',
      headers: { 'x-ratelimit-remaining-tokens': '2000' },
    });
    await new Promise(r => setTimeout(r, 20));

    const event = db.prepare("SELECT * FROM events WHERE type = 'rate_limit_warning'").get();
    expect(event).toBeUndefined();
  });

  it('defaults to 5000 when no threshold provided', async () => {
    vi.resetModules();
    const { makeObservabilityExtension } = await import('@src/extensions/observability.js');
    const db = makeDb();
    const pi = makePi(db);
    // No threshold — use default
    makeObservabilityExtension(pi as any, db);

    // 4999 < 5000 default → should trigger
    pi.emit('after_provider_response', {
      contextId: 'main',
      provider: 'test-provider',
      headers: { 'x-ratelimit-remaining-tokens': '4999' },
    });
    await new Promise(r => setTimeout(r, 20));

    const event = db.prepare("SELECT * FROM events WHERE type = 'rate_limit_warning'").get() as any;
    expect(event).toBeDefined();
  });
});
