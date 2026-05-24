import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';

// We import makeMemoryExtension — the actual implementation
// The test will prove that session_search works with dynamic import instead of require()
const { makeMemoryExtension } = await import('../../src/extensions/memory-manager.js');

describe('session_search ESM compatibility', () => {
  it('returns results from FTS5 search without throwing ReferenceError', async () => {
    // Create an in-memory DB with the FTS5 messages table
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        role, content,
        content='messages',
        content_rowid='id'
      );
    `);

    // Insert some test messages
    db.prepare(`INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)`).run(
      'user', 'Hello world, this is a test message', '2026-01-01T00:00:00Z'
    );
    db.prepare(`INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)`).run(
      'assistant', 'Hi there! How can I help?', '2026-01-01T00:00:01Z'
    );

    // Mock the DB getter to return our in-memory DB
    vi.mock('../../src/db/index.js', () => ({
      getDb: () => db,
    }));

    const mockPi = {
      on: vi.fn(),
      registerTool: vi.fn(),
    };

    makeMemoryExtension(mockPi as any, {
      memory: { enabled: true, consolidation: { enabled: false } },
    });

    // Find the session_search tool registration
    const registerCalls = (mockPi.registerTool as any).mock.calls;
    const sessionSearchCall = registerCalls.find(
      (call: any) => call[0].name === 'session_search'
    );

    expect(sessionSearchCall).toBeDefined();

    // Execute the tool
    const toolDef = sessionSearchCall[0];
    const result = await toolDef.execute('test-id', { query: 'hello', limit: 5 });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('results');
    expect(Array.isArray(parsed.results)).toBe(true);

    db.close();
  });

  it('returns graceful error when DB is not available', async () => {
    // We'll mock getDb to throw — this simulates "DB not available" at runtime
    vi.mock('../../src/db/index.js', () => ({
      getDb: vi.fn(() => {
        throw new Error('Database not available');
      }),
    }));

    const mockPi = {
      on: vi.fn(),
      registerTool: vi.fn(),
    };

    makeMemoryExtension(mockPi as any, {
      memory: { enabled: false },
    });

    const registerCalls = (mockPi.registerTool as any).mock.calls;
    const sessionSearchCall = registerCalls.find(
      (call: any) => call[0].name === 'session_search'
    );

    expect(sessionSearchCall).toBeDefined();

    const toolDef = sessionSearchCall[0];
    const result = await toolDef.execute('test-id', { query: 'hello' });

    expect(result).toBeDefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toEqual([]);
    expect(parsed.error).toBe('Database not available');

    vi.resetModules();
  });
});