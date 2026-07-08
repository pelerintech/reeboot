/**
 * Per-chat history persistence for the ree SDK.
 *
 * Manages two tables:
 * - `chats`: chat metadata (id, created_at, last_activity_at, status)
 * - `chat_messages`: per-chat message history (id, chat_id, role, content, created_at)
 *
 * This is reeboot-owned persistence — separate from pi's SessionManager
 * and the orchestrator's `messages` table. The store is pruned on idle eviction
 * but preserved on explicit dispose (so resume works across voluntary restarts).
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessageRow {
  role: string;
  content: string;
  created_at: string;
}

// ─── Migration ───────────────────────────────────────────────────────────────

/**
 * Run the ree history migration (CREATE TABLE IF NOT EXISTS).
 * Returns true if tables were created, false if they already existed.
 */
export function runReeHistoryMigration(db: Database.Database): boolean {
  const tablesBefore = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const hasChats = tablesBefore.some((t) => t.name === 'chats');
  const hasChatMessages = tablesBefore.some((t) => t.name === 'chat_messages');

  if (!hasChats) {
    db.exec(`
      CREATE TABLE chats (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'active'
      )
    `);
  }

  if (!hasChatMessages) {
    db.exec(`
      CREATE TABLE chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL REFERENCES chats(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Index for fast per-chat queries
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(chat_id, created_at DESC)`);
  }

  return !hasChats || !hasChatMessages;
}

// ─── Init ────────────────────────────────────────────────────────────────────

/**
 * Initialize the ree history store at the given DB path.
 * Creates the file and applies the migration if needed.
 */
export function initReeHistory(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runReeHistoryMigration(db);

  return db;
}

// ─── Chat operations ─────────────────────────────────────────────────────────

/**
 * Upsert a chat record (insert or update last_activity_at).
 */
export function upsertChat(db: Database.Database, chatId: string, status: string = 'active'): void {
  db.prepare(`
    INSERT INTO chats (id, status, last_activity_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      last_activity_at = datetime('now')
  `).run(chatId, status);
}

/**
 * Mark a chat as disposed.
 */
export function markChatDisposed(db: Database.Database, chatId: string): void {
  db.prepare(`UPDATE chats SET status = 'disposed', last_activity_at = datetime('now') WHERE id = ?`).run(chatId);
}

// ─── Message operations ──────────────────────────────────────────────────────

/**
 * Persist a complete turn (user message + assistant response) for a chat.
 */
export function persistTurn(
  db: Database.Database,
  chatId: string,
  userMsg: { role: string; content: unknown },
  assistantMsg: { role: string; content: unknown },
): void {
  // Ensure the chat exists
  upsertChat(db, chatId);

  const insert = db.prepare(`
    INSERT INTO chat_messages (chat_id, role, content)
    VALUES (?, ?, ?)
  `);

  insert.run(chatId, userMsg.role, JSON.stringify(userMsg.content));
  insert.run(chatId, assistantMsg.role, JSON.stringify(assistantMsg.content));
}

/**
 * Load message history for a chat, up to a limit.
 * Returns messages in chronological order (oldest first).
 */
export function loadHistory(db: Database.Database, chatId: string, limit: number = 50): ChatMessageRow[] {
  const rows = db.prepare(`
    SELECT role, content, created_at
    FROM chat_messages
    WHERE chat_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(chatId, limit) as ChatMessageRow[];

  // Reverse to get chronological order (oldest first)
  return rows.reverse();
}

/**
 * Prune all messages for a chat (called on idle eviction).
 */
export function pruneHistory(db: Database.Database, chatId: string): void {
  db.prepare(`DELETE FROM chat_messages WHERE chat_id = ?`).run(chatId);
  markChatDisposed(db, chatId);
}
