/**
 * Context system
 *
 * Manages context workspace directories, AGENTS.md files, session file paths,
 * and context/session metadata in SQLite.
 *
 * ~/.reeboot/
 *   contexts/
 *     global/
 *       AGENTS.md           — prepended to every context's system prompt
 *     <contextId>/
 *       workspace/          — cwd for agent (project files go here)
 *       .pi/extensions/     — context-local extensions
 *       .pi/skills/         — context-local skills
 *       AGENTS.md           — context-specific system prompt additions
 *   sessions/
 *     <contextId>/
 *       session-<timestamp>-<id>.json
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { nanoid } from 'nanoid';
import type Database from 'better-sqlite3';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextRow {
  id: string;
  name: string;
  model_provider: string;
  model_id: string;
  status: string;
  created_at: string;
}

export interface SessionInfo {
  sessionId: string;
  startedAt: string;
  messageCount: number;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

export function createContextsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contexts (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      model_provider TEXT NOT NULL DEFAULT '',
      model_id      TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'active',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export interface CreateContextParams {
  id?: string;
  name: string;
  modelProvider: string;
  modelId: string;
}

export function createContext(
  db: Database.Database,
  params: CreateContextParams
): ContextRow {
  const id = params.id ?? nanoid();
  db.prepare(
    `INSERT INTO contexts (id, name, model_provider, model_id, status)
     VALUES (?, ?, ?, ?, 'active')`
  ).run(id, params.name, params.modelProvider, params.modelId);
  return db.prepare('SELECT * FROM contexts WHERE id = ?').get(id) as ContextRow;
}

export function listContexts(db: Database.Database): ContextRow[] {
  return db.prepare('SELECT * FROM contexts ORDER BY created_at ASC').all() as ContextRow[];
}

export function getContextById(db: Database.Database, id: string): ContextRow | undefined {
  return db.prepare('SELECT * FROM contexts WHERE id = ?').get(id) as ContextRow | undefined;
}

// ─── Workspace helpers ────────────────────────────────────────────────────────

const DEFAULT_AGENTS_MD = `# Agent Instructions

You are a helpful personal AI assistant.

- Be concise and practical
- When in doubt, ask for clarification
- Respect privacy — never share information outside this conversation
`;

const GLOBAL_AGENTS_MD = `# Global Instructions

These instructions apply to every context.

- Follow user instructions precisely
- Be honest about your capabilities and limitations
`;

/**
 * Ensures the context workspace directory structure exists.
 * Does NOT overwrite an existing AGENTS.md.
 */
export async function initContextWorkspace(
  contextId: string,
  reebotDir: string = join(homedir(), '.reeboot')
): Promise<void> {
  const contextDir = join(reebotDir, 'contexts', contextId);
  const workspaceDir = join(contextDir, 'workspace');
  const piExtensionsDir = join(contextDir, '.pi', 'extensions');
  const piSkillsDir = join(contextDir, '.pi', 'skills');
  const agentsPath = join(contextDir, 'AGENTS.md');

  mkdirSync(workspaceDir, { recursive: true });
  mkdirSync(piExtensionsDir, { recursive: true });
  mkdirSync(piSkillsDir, { recursive: true });

  if (!existsSync(agentsPath)) {
    writeFileSync(agentsPath, DEFAULT_AGENTS_MD, 'utf-8');
  }
}

/**
 * Ensures the global context exists with its AGENTS.md.
 */
export async function initGlobalContext(
  reebotDir: string = join(homedir(), '.reeboot')
): Promise<void> {
  const globalDir = join(reebotDir, 'contexts', 'global');
  const agentsPath = join(globalDir, 'AGENTS.md');

  mkdirSync(globalDir, { recursive: true });

  if (!existsSync(agentsPath)) {
    writeFileSync(agentsPath, GLOBAL_AGENTS_MD, 'utf-8');
  }
}

// ─── Session path ─────────────────────────────────────────────────────────────

/**
 * Returns a deterministic-ish session file path for a context.
 * The session directory is `~/.reeboot/sessions/<contextId>/`.
 * The file name encodes a timestamp + random id so each invocation is unique.
 */
export function getActiveSessionPath(
  contextId: string,
  reebotDir: string = join(homedir(), '.reeboot')
): string {
  const sessionsDir = join(reebotDir, 'sessions', contextId);
  mkdirSync(sessionsDir, { recursive: true });
  const ts = Date.now();
  const id = nanoid(8);
  return join(sessionsDir, `session-${ts}-${id}.json`);
}

// ─── Session listing ──────────────────────────────────────────────────────────

export async function listSessions(
  contextId: string,
  reebotDir: string = join(homedir(), '.reeboot')
): Promise<SessionInfo[]> {
  const sessionsDir = join(reebotDir, 'sessions', contextId);
  if (!existsSync(sessionsDir)) return [];

  const files = readdirSync(sessionsDir)
    .filter(f => f.startsWith('session-') && f.endsWith('.json'))
    .sort();

  return files.map(f => {
    const fullPath = join(sessionsDir, f);
    const stat = statSync(fullPath);
    // Parse timestamp from filename: session-<ts>-<id>.json
    const match = f.match(/^session-(\d+)-/);
    const startedAt = match ? new Date(parseInt(match[1], 10)).toISOString() : stat.mtime.toISOString();
    return {
      sessionId: f.replace('.json', ''),
      startedAt,
      messageCount: 0, // Would need to parse the JSON to get actual count; skip for now
    };
  });
}

// ─── Session resume ───────────────────────────────────────────────────────────

/**
 * Returns the most recent session file path for a context if it was updated
 * within the inactivity window; otherwise returns null (start fresh).
 */
export function getResumedSessionPath(
  contextId: string,
  inactivityTimeoutMs: number,
  reebotDir: string = join(homedir(), '.reeboot')
): string | null {
  const sessionsDir = join(reebotDir, 'sessions', contextId);
  if (!existsSync(sessionsDir)) return null;

  const files = readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .reverse(); // most recent first

  if (files.length === 0) return null;

  const latest = files[0];
  const fullPath = join(sessionsDir, latest);
  const stat = statSync(fullPath);
  const age = Date.now() - stat.mtimeMs;

  return age < inactivityTimeoutMs ? fullPath : null;
}

// ─── initContexts ─────────────────────────────────────────────────────────────

/**
 * Called on startup — ensures the main context and global context exist.
 */
export async function initContexts(
  db: Database.Database,
  reebotDir: string = join(homedir(), '.reeboot')
): Promise<void> {
  // Ensure ~/.reeboot/agent/AGENTS.md exists (reeboot persona for pi agentDir)
  const { initAgentDir } = await import('./utils/agent-dir.js');
  await initAgentDir(reebotDir);

  await initGlobalContext(reebotDir);

  // Ensure "main" context exists in DB
  const existing = getContextById(db, 'main');
  if (!existing) {
    createContext(db, {
      id: 'main',
      name: 'main',
      modelProvider: '',
      modelId: '',
    });
  }

  await initContextWorkspace('main', reebotDir);
}
