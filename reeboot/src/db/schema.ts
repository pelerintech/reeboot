import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

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
