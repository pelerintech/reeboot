import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import cronParser from 'cron-parser';

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
      const next = cronParser.parseExpression(expr).next().toDate().toISOString();
      update.run(next, row.id);
    } catch {
      // If cron expression is invalid, set next_run to now so it runs on next poll
      update.run(new Date().toISOString(), row.id);
    }
  }
}
