import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import * as schema from './schema.js';
// ─── Singleton state ──────────────────────────────────────────────────────────
let _db = null;
let _dbClosed = false;
// ─── openDatabase ─────────────────────────────────────────────────────────────
/**
 * Opens (or re-uses) a SQLite database at the given path.
 * Creates the file and applies the schema if it does not exist.
 * Returns the raw better-sqlite3 Database instance.
 */
export function openDatabase(dbPath) {
    const path = dbPath ?? join(homedir(), '.reeboot', 'reeboot.db');
    if (_db && !_dbClosed) {
        return _db;
    }
    // Ensure directory exists
    mkdirSync(dirname(path), { recursive: true });
    const db = new Database(path);
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    // Enforce foreign keys
    db.pragma('foreign_keys = ON');
    // Apply schema (CREATE TABLE IF NOT EXISTS via Drizzle push equivalent)
    applySchema(db);
    _db = db;
    _dbClosed = false;
    return db;
}
// ─── getDb ───────────────────────────────────────────────────────────────────
/**
 * Returns the singleton database instance.
 * Throws if the database has not been opened or has been closed.
 */
export function getDb() {
    if (_dbClosed || !_db) {
        throw new Error('Database is closed. Call openDatabase() first.');
    }
    return _db;
}
// ─── closeDb ─────────────────────────────────────────────────────────────────
/**
 * Closes the database connection cleanly.
 */
export function closeDb() {
    if (_db) {
        _db.close();
        _db = null;
        _dbClosed = true;
    }
}
// ─── getDrizzle ──────────────────────────────────────────────────────────────
/**
 * Returns a Drizzle ORM instance wrapping the singleton connection.
 */
export function getDrizzle() {
    return drizzle(getDb(), { schema });
}
// ─── Schema application ──────────────────────────────────────────────────────
function applySchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id          TEXT    PRIMARY KEY,
      name        TEXT    NOT NULL,
      model_provider TEXT NOT NULL DEFAULT '',
      model_id    TEXT    NOT NULL DEFAULT '',
      status      TEXT    NOT NULL DEFAULT 'active',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT    PRIMARY KEY,
      context_id  TEXT    NOT NULL REFERENCES contexts(id),
      channel     TEXT    NOT NULL,
      peer_id     TEXT    NOT NULL,
      role        TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      tokens_used INTEGER          DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT    PRIMARY KEY,
      context_id  TEXT    NOT NULL REFERENCES contexts(id),
      schedule    TEXT    NOT NULL,
      prompt      TEXT    NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 1,
      last_run    TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS channels (
      type        TEXT    PRIMARY KEY,
      status      TEXT    NOT NULL DEFAULT 'disconnected',
      config      TEXT    NOT NULL DEFAULT '{}',
      connected_at TEXT
    );

    CREATE TABLE IF NOT EXISTS usage (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      context_id    TEXT    NOT NULL REFERENCES contexts(id),
      input_tokens  INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      model         TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
