import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { CronExpressionParser } from 'cron-parser';

// ─── contexts ────────────────────────────────────────────────────────────────

export const contexts = sqliteTable('contexts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  modelProvider: text('model_provider').notNull().default(''),
  modelId: text('model_id').notNull().default(''),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── messages ────────────────────────────────────────────────────────────────

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  contextId: text('context_id')
    .notNull()
    .references(() => contexts.id),
  channel: text('channel').notNull(),
  peerId: text('peer_id').notNull(),
  role: text('role').notNull(),       // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  tokensUsed: integer('tokens_used').default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── tasks ───────────────────────────────────────────────────────────────────

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  contextId: text('context_id')
    .notNull()
    .references(() => contexts.id),
  schedule: text('schedule').notNull(),   // cron expression
  prompt: text('prompt').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRun: text('last_run'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── channels ────────────────────────────────────────────────────────────────

export const channels = sqliteTable('channels', {
  type: text('type').primaryKey(),        // 'web' | 'whatsapp' | 'signal'
  status: text('status').notNull().default('disconnected'),
  config: text('config').notNull().default('{}'),  // JSON blob
  connectedAt: text('connected_at'),
});

// ─── usage ───────────────────────────────────────────────────────────────────

export const usage = sqliteTable('usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contextId: text('context_id')
    .notNull()
    .references(() => contexts.id),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  model: text('model').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── task_runs ───────────────────────────────────────────────────────────────

export const taskRuns = sqliteTable('task_runs', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id),
  runAt: text('run_at').notNull().default(sql`(datetime('now'))`),
  durationMs: integer('duration_ms').notNull().default(0),
  status: text('status').notNull(),   // 'success' | 'error'
  result: text('result'),
  error: text('error'),
});

// ─── Migration ───────────────────────────────────────────────────────────────

/**
 * Runs an idempotent migration to add FTS5 session search and memory_log
 * observability table. Safe to call multiple times.
 */
export function runMemoryMigration(db: import('better-sqlite3').Database): void {
  // FTS5 virtual table for session search over messages
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      content=messages,
      content_rowid=rowid
    );
  `);

  // INSERT trigger: keep FTS in sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_ai
    AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content)
      VALUES (new.rowid, new.content);
    END;
  `);

  // DELETE trigger: keep FTS in sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_ad
    AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content)
      VALUES ('delete', old.rowid, old.content);
    END;
  `);

  // UPDATE trigger: keep FTS in sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_au
    AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content)
      VALUES ('delete', old.rowid, old.content);
      INSERT INTO messages_fts(rowid, content)
      VALUES (new.rowid, new.content);
    END;
  `);

  // Backfill existing messages into FTS (idempotent via 'delete' + re-insert pattern)
  // We use a simple approach: only backfill rows not yet indexed.
  // FTS content tables don't have a direct "exists" check, so we rebuild cleanly.
  db.exec(`INSERT INTO messages_fts(messages_fts) VALUES('rebuild')`);

  // memory_log observability table
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_log (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      ran_at               TEXT    NOT NULL DEFAULT (datetime('now')),
      trigger              TEXT    NOT NULL,
      sessions_processed   INTEGER NOT NULL DEFAULT 0,
      ops_applied          INTEGER NOT NULL DEFAULT 0,
      memory_chars_before  INTEGER,
      memory_chars_after   INTEGER,
      user_chars_before    INTEGER,
      user_chars_after     INTEGER,
      notes                TEXT
    );
  `);
}

/**
 * Runs an idempotent migration to add knowledge domain tables.
 * Creates knowledge_sources, knowledge_chunks (vec0), knowledge_fts (FTS5),
 * and wiki_pages tables. Safe to call multiple times.
 */
export function runKnowledgeMigration(db: import('better-sqlite3').Database): void {
  // Raw document registry
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_sources (
      id           TEXT PRIMARY KEY,
      path         TEXT NOT NULL UNIQUE,
      hash         TEXT NOT NULL,
      source_tier  TEXT NOT NULL,
      confidence   TEXT NOT NULL DEFAULT 'medium',
      filename     TEXT NOT NULL,
      format       TEXT NOT NULL,
      chunk_count  INTEGER NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'pending',
      ingested_at  TEXT,
      error        TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Vector search via sqlite-vec vec0 virtual table
  // Note: sqlite-vec auxiliary columns must be TEXT to avoid type mismatch
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks USING vec0(
      embedding float[768],
      +doc_id TEXT,
      +chunk_index TEXT,
      +content TEXT
    )
  `);

  // FTS5 full-text search over chunk content
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
      content,
      doc_id UNINDEXED,
      chunk_index UNINDEXED,
      source_tier UNINDEXED
    )
  `);

  // Wiki page metadata (content lives in files)
  db.exec(`
    CREATE TABLE IF NOT EXISTS wiki_pages (
      id           TEXT PRIMARY KEY,
      path         TEXT NOT NULL UNIQUE,
      page_type    TEXT NOT NULL,
      source_tier  TEXT NOT NULL DEFAULT 'wiki-synthesis',
      confidence   TEXT NOT NULL DEFAULT 'low',
      sources      TEXT NOT NULL DEFAULT '[]',
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Runs an idempotent migration to add new columns to the tasks table and
 * create the task_runs table. Safe to call multiple times.
 */
export function runMigration(db: import('better-sqlite3').Database): void {
  // Get existing columns on tasks table
  const existingCols = new Set(
    (db.pragma('table_info(tasks)') as Array<{ name: string }>).map((c) => c.name)
  );

  const newColumns: Array<{ name: string; definition: string }> = [
    { name: 'schedule_type', definition: "TEXT NOT NULL DEFAULT 'cron'" },
    { name: 'schedule_value', definition: "TEXT NOT NULL DEFAULT ''" },
    { name: 'normalized_ms', definition: 'INTEGER' },
    { name: 'status', definition: "TEXT NOT NULL DEFAULT 'active'" },
    { name: 'next_run', definition: 'TEXT' },
    { name: 'last_result', definition: 'TEXT' },
    { name: 'context_mode', definition: "TEXT NOT NULL DEFAULT 'shared'" },
  ];

  for (const col of newColumns) {
    if (!existingCols.has(col.name)) {
      db.exec(`ALTER TABLE tasks ADD COLUMN ${col.name} ${col.definition}`);
    }
  }

  // Create task_runs table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      run_at TEXT NOT NULL DEFAULT (datetime('now')),
      duration_ms INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT
    )
  `);

  // Compute next_run for existing cron tasks that lack it
  _computeMissingNextRuns(db);
}

/**
 * For legacy rows where schedule_type='cron' and next_run is NULL,
 * compute next_run from the schedule column using cron-parser.
 */
function _computeMissingNextRuns(db: import('better-sqlite3').Database): void {

  const rows = db
    .prepare("SELECT id, schedule, schedule_value FROM tasks WHERE schedule_type = 'cron' AND next_run IS NULL")
    .all() as Array<{ id: string; schedule: string; schedule_value: string }>;

  const update = db.prepare("UPDATE tasks SET next_run = ? WHERE id = ?");

  for (const row of rows) {
    const expr = row.schedule_value || row.schedule;
    try {
      const next = CronExpressionParser.parse(expr).next().toDate().toISOString();
      update.run(next, row.id);
    } catch {
      // If cron expression is invalid, set next_run to now so it runs on next poll
      update.run(new Date().toISOString(), row.id);
    }
  }
}
