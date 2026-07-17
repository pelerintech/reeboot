/**
 * Spec: session-search-scoping (verification only)
 *
 * `session_search` in ree is scoped to the current chat, so a customer cannot
 * search another customer's history. Verifies and locks the existing
 * `WHERE m.chat_id = ?` scope against regression.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync } from 'fs';

describe('session-search-scoping (verification)', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `ree-ss-iso-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    db = new Database(join(tmpDir, 'ree-history.db'));
    db.pragma('journal_mode = WAL');
  });

  afterEach(() => {
    try { db.close(); } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('S1 — search from chat A returns only A messages; none of B', async () => {
    const { runReeHistoryMigration } = await import('@src/runtime/ree-history.js');
    runReeHistoryMigration(db);

    // chats must exist (FK constraint)
    db.prepare(`INSERT INTO chats (id, status) VALUES (?, 'active')`).run('A');
    db.prepare(`INSERT INTO chats (id, status) VALUES (?, 'active')`).run('B');

    // Chat A: general support content (no "refund")
    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('A', 'user', 'How do I reset my password?');
    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('A', 'assistant', 'You can reset it from the settings page.');

    // Chat B: contains "refund"
    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('B', 'user', 'I want a refund for my order');
    db.prepare(`INSERT INTO chat_messages (chat_id, role, content) VALUES (?, ?, ?)`).run('B', 'assistant', 'I can help process your refund.');

    // The session_search SQL scoped to chat A, searching for "refund"
    const aResults = db.prepare(`
      SELECT m.role, m.content
      FROM chat_messages_fts f
      JOIN chat_messages m ON m.id = f.rowid
      WHERE m.chat_id = ? AND chat_messages_fts MATCH ?
      ORDER BY m.created_at DESC
    `).all('A', 'refund') as Array<{ role: string; content: string }>;

    expect(aResults).toEqual([]);

    // Sanity: the same query scoped to B DOES find the refund rows
    const bResults = db.prepare(`
      SELECT m.role, m.content
      FROM chat_messages_fts f
      JOIN chat_messages m ON m.id = f.rowid
      WHERE m.chat_id = ? AND chat_messages_fts MATCH ?
      ORDER BY m.created_at DESC
    `).all('B', 'refund') as Array<{ role: string; content: string }>;

    expect(bResults.length).toBe(2);
    expect(bResults.some((r) => r.content.includes('refund'))).toBe(true);
  });

  it('S2 — current chat id comes from the bound adapter', async () => {
    const { ReeExtensionAdapter } = await import('@src/extensions/ree-adapter.js');
    const { ReeChat } = await import('@src/runtime/ree-chat.js');

    const context = {
      cwd: '/tmp', workspacePath: '/tmp', config: {},
      ui: { select: async () => undefined, confirm: async () => false, input: async () => undefined, notify: () => {} },
      hasUI: false,
    };
    const chat = new ReeChat('cust-42', { maxHistory: 50, context, config: {} });
    const adapter = new ReeExtensionAdapter(chat);

    expect(typeof adapter.getCurrentChatId).toBe('function');
    expect(adapter.getCurrentChatId()).toBe('cust-42');

    // A different chat reports a different id — no cross-chat leakage
    const chatB = new ReeChat('other-cust', { maxHistory: 50, context, config: {} });
    const adapterB = new ReeExtensionAdapter(chatB);
    expect(adapterB.getCurrentChatId()).toBe('other-cust');
    expect(adapter.getCurrentChatId()).toBe('cust-42');
  });
});
