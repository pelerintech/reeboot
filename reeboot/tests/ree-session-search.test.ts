/**
 * session_search in ree mode
 *
 * Verifies that session_search is available in ree mode and scoped
 * to the current chat's history.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';
import type { ExtensionAPI } from '../src/extensions/extension-api.js';

describe('ExtensionAPI — getCurrentChatId', () => {
  it('ReeExtensionAdapter exposes getCurrentChatId', async () => {
    const { ReeExtensionAdapter } = await import('../src/extensions/ree-adapter.js');
    const { ReeChat } = await import('../src/runtime/ree-chat.js');

    const context = { cwd: '/tmp', workspacePath: '/tmp', config: {}, ui: { select: async () => undefined, confirm: async () => false, input: async () => undefined, notify: () => {} }, hasUI: false };
    const chat = new ReeChat('test-chat', { maxHistory: 50, context, config: {} });

    const adapter = new ReeExtensionAdapter(chat);
    expect(typeof adapter.getCurrentChatId).toBe('function');
    expect(adapter.getCurrentChatId()).toBe('test-chat');
  });

  it('PiExtensionAdapter does not expose getCurrentChatId', async () => {
    const { PiExtensionAdapter } = await import('../src/extensions/pi-adapter.js');
    const mockSession = {} as any;
    const adapter = new PiExtensionAdapter(mockSession);

    expect((adapter as any).getCurrentChatId).toBeUndefined();
  });
});

describe('ree session_search extension', () => {
  it('getReeFactories includes session_search tool', async () => {
    const { getReeFactories } = await import('../src/extensions/loader.js');
    const { ConfigSchema } = await import('../src/config.js');
    const config = ConfigSchema.parse({ sdk: 'ree' });
    const factories = getReeFactories(config);

    // Find the session_search factory (5th factory)
    expect(factories.length).toBeGreaterThanOrEqual(5);

    // The last factory (capabilities) registers the tool set
    // session_search should be registered as a tool
    const { ReeExtensionAdapter } = await import('../src/extensions/ree-adapter.js');
    const { ReeChat } = await import('../src/runtime/ree-chat.js');

    const context = { cwd: '/tmp', workspacePath: '/tmp', config: {}, ui: { select: async () => undefined, confirm: async () => false, input: async () => undefined, notify: () => {} }, hasUI: false };
    const chat = new ReeChat('test-chat', { maxHistory: 50, context, config: {} });

    const adapter = new ReeExtensionAdapter(chat);

    // Run all factory functions against the adapter
    for (const factory of factories) {
      await factory(adapter);
    }

    // Check if session_search tool is registered
    const tools = adapter.getAllTools();
    const sessionSearch = tools.find((t) => t.name === 'session_search');
    expect(sessionSearch).toBeDefined();
    expect(sessionSearch?.name).toBe('session_search');
  });
});

describe('session_search FTS5 queries — S2: scoped per chat', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `ree-fts-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    db = new Database(join(tmpDir, 'ree-history.db'));
    db.pragma('journal_mode = WAL');
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('S2: session_search returns only messages from current chat', async () => {
    const { runReeHistoryMigration } = await import('../src/runtime/ree-history.js');
    runReeHistoryMigration(db);

    // Create chats first (FOREIGN KEY constraint)
    db.prepare(`INSERT INTO chats (id, status) VALUES (?, 'active')`).run('abc');
    db.prepare(`INSERT INTO chats (id, status) VALUES (?, 'active')`).run('xyz');

    // Seed messages directly (triggers populate FTS5)
    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('abc', 'user', 'My name is Alice');
    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('abc', 'assistant', 'Hello Alice!');
    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('abc', 'user', 'What is the capital of France?');
    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('abc', 'assistant', 'The capital of France is Paris.');
    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('abc', 'user', 'Tell me about machine learning');
    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('abc', 'assistant', 'Machine learning is a subset of AI');

    // Chat 'xyz' — should not appear in abc's results
    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('xyz', 'user', 'What is the weather today?');
    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('xyz', 'assistant', 'The weather is sunny.');

    // Query abc's chat for "capital" — should find only abc's message
    const abcResults = db.prepare(`
      SELECT m.role, m.content, m.created_at
      FROM chat_messages_fts f
      JOIN chat_messages m ON m.id = f.rowid
      WHERE m.chat_id = ? AND chat_messages_fts MATCH ?
      ORDER BY m.created_at DESC
    `).all('abc', 'capital') as Array<{ role: string; content: string; created_at: string }>;

    expect(abcResults.length).toBe(2);
    const roles = abcResults.map(r => r.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
    const contents = abcResults.map(r => r.content);
    expect(contents).toContain('What is the capital of France?');
    expect(contents).toContain('The capital of France is Paris.');
    // No results from chat 'xyz'
    expect(contents).not.toContain('sunny');

    // Query xyz's chat for "weather" — should find only xyz's message
    const xyzResults = db.prepare(`
      SELECT m.role, m.content, m.created_at
      FROM chat_messages_fts f
      JOIN chat_messages m ON m.id = f.rowid
      WHERE m.chat_id = ? AND chat_messages_fts MATCH ?
      ORDER BY m.created_at DESC
    `).all('xyz', 'weather') as Array<{ role: string; content: string; created_at: string }>;

    expect(xyzResults.length).toBe(2);
    const xyzRoles = xyzResults.map(r => r.role);
    expect(xyzRoles).toContain('user');
    expect(xyzRoles).toContain('assistant');
    const xyzContents = xyzResults.map(r => r.content);
    expect(xyzContents).toContain('What is the weather today?');
    // No results from chat 'abc'
    expect(xyzContents).not.toContain('Alice');
  });

  it('S3: session_search returns empty array for non-matching query', async () => {
    const { runReeHistoryMigration } = await import('../src/runtime/ree-history.js');
    runReeHistoryMigration(db);

    // Create chat first (FOREIGN KEY constraint)
    db.prepare(`INSERT INTO chats (id, status) VALUES (?, 'active')`).run('abc');

    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('abc', 'user', 'My name is Alice');
    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('abc', 'assistant', 'Hello Alice!');

    // Query for something that doesn't exist in chat
    const results = db.prepare(`
      SELECT m.role, m.content, m.created_at
      FROM chat_messages_fts f
      JOIN chat_messages m ON m.id = f.rowid
      WHERE m.chat_id = ? AND chat_messages_fts MATCH ?
      ORDER BY m.created_at DESC
    `).all('abc', 'penguin') as Array<{ role: string; content: string; created_at: string }>;

    expect(results).toEqual([]);
  });
});
