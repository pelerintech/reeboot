import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Helper to build a mock pi ExtensionAPI
function makeMockPi(handlers: Record<string, Function[]> = {}) {
  return {
    on(event: string, handler: Function) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    handlers,
  };
}

// Helper to build a mock agent_end event
function makeAgentEndEvent(costTotal: number, inputTokens = 100, outputTokens = 50, model = 'test-model') {
  return {
    messages: [
      {
        role: 'assistant',
        usage: {
          inputTokens,
          outputTokens,
          cost: { total: costTotal },
        },
        model,
      },
    ],
  };
}

describe('token-meter cost and operation_type persistence', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'token-meter-test-'));
    db = new Database(':memory:');

    // Apply base schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        context_id TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Apply budget migration
    const { runBudgetMigration } = await import('@src/db/schema.js');
    runBudgetMigration(db);

    // Insert a context row
    db.prepare(`INSERT INTO contexts (id, name) VALUES ('test-context', 'Test')`).run();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('persists cost_usd from usage.cost.total', async () => {
    // Mock getDb to return our test db
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    const handlers: Record<string, Function[]> = {};
    const pi = makeMockPi(handlers);

    // Import token-meter (fresh to pick up mock)
    const tokenMeter = await import('../../src/extensions/token-meter.js');
    (tokenMeter.default as any)(pi);

    const event = makeAgentEndEvent(0.042);
    const ctx = { cwd: join(tmpDir, 'workspace', 'test-context') };

    await handlers['agent_end'][0](event, ctx);

    const row = db.prepare(`SELECT * FROM usage ORDER BY id DESC LIMIT 1`).get() as any;
    expect(row).toBeDefined();
    expect(row.cost_usd).toBeCloseTo(0.042, 6);
    expect(row.input_tokens).toBe(100);
    expect(row.output_tokens).toBe(50);
  });

  it('sets operation_type = user_message when no meta file exists', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    const handlers: Record<string, Function[]> = {};
    const pi = makeMockPi(handlers);

    const tokenMeter = await import('../../src/extensions/token-meter.js');
    (tokenMeter.default as any)(pi);

    const event = makeAgentEndEvent(0.01);
    // cwd with no .reeboot_turn_meta.json
    const ctx = { cwd: join(tmpDir, 'workspace', 'test-context') };

    await handlers['agent_end'][0](event, ctx);

    const row = db.prepare(`SELECT * FROM usage ORDER BY id DESC LIMIT 1`).get() as any;
    expect(row.operation_type).toBe('user_message');
  });

  it('reads operation_type from .reeboot_turn_meta.json when present', async () => {
    vi.doMock('../../src/db/index.js', () => ({ getDb: () => db }));

    const handlers: Record<string, Function[]> = {};
    const pi = makeMockPi(handlers);

    const tokenMeter = await import('../../src/extensions/token-meter.js');
    (tokenMeter.default as any)(pi);

    // Write meta file
    const workspace = join(tmpDir, 'workspace', 'test-context');
    const { mkdirSync } = await import('fs');
    mkdirSync(workspace, { recursive: true });
    writeFileSync(
      join(workspace, '.reeboot_turn_meta.json'),
      JSON.stringify({ operationType: 'scheduler', turnId: 'turn-123' })
    );

    const event = makeAgentEndEvent(0.01);
    const ctx = { cwd: workspace };

    await handlers['agent_end'][0](event, ctx);

    const row = db.prepare(`SELECT * FROM usage ORDER BY id DESC LIMIT 1`).get() as any;
    expect(row.operation_type).toBe('scheduler');
  });
});
