/**
 * Memory Manager Extension
 *
 * Provides persistent, self-evolving memory for the reeboot agent via two
 * bounded markdown files (MEMORY.md and USER.md) stored at ~/.reeboot/memories/.
 *
 * Registers:
 *   - `memory` tool   (gated by memory.enabled) — add/replace/remove entries
 *   - `session_search` tool (always) — FTS5 full-text search over message history
 *
 * Lifecycle hooks:
 *   - before_agent_start — injects frozen memory snapshot into system prompt
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type Database from 'better-sqlite3';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MEMORY_HEADER = '# MEMORY\n\n';
export const USER_HEADER = '# USER PROFILE\n\n';

// ─── initMemoryFiles ─────────────────────────────────────────────────────────

/**
 * Creates the memories directory and initialises MEMORY.md and USER.md with
 * empty-content headers if they don't already exist. Idempotent — never
 * overwrites existing files.
 */
export function initMemoryFiles(memoriesDir: string): void {
  mkdirSync(memoriesDir, { recursive: true });

  const memoryPath = join(memoriesDir, 'MEMORY.md');
  const userPath = join(memoriesDir, 'USER.md');

  if (!existsSync(memoryPath)) {
    writeFileSync(memoryPath, MEMORY_HEADER, 'utf-8');
  }
  if (!existsSync(userPath)) {
    writeFileSync(userPath, USER_HEADER, 'utf-8');
  }
}

// ─── readMemoryFile ───────────────────────────────────────────────────────────

export function readMemoryFile(filePath: string): string {
  if (!existsSync(filePath)) return '';
  return readFileSync(filePath, 'utf-8');
}

// ─── getEntries ───────────────────────────────────────────────────────────────

/**
 * Parses memory file content into individual entries (non-empty lines after header).
 */
export function getEntries(content: string, header: string): string[] {
  const body = content.startsWith(header) ? content.slice(header.length) : content;
  return body
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
}

// ─── buildContent ────────────────────────────────────────────────────────────

export function buildContent(entries: string[], header: string): string {
  if (entries.length === 0) return header;
  return header + entries.join('\n') + '\n';
}

// ─── scanContent ─────────────────────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /\bsystem\s*:/i,
  /\bassistant\s*:/i,
  /\[INST\]/i,
  /<<SYS>>/i,
];

const CREDENTIAL_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,          // OpenAI-style keys
  /[a-zA-Z0-9+/]{40,}={0,2}/,     // base64 token (40+ chars)
  /password\s*[:=]\s*\S+/i,
];

const INVISIBLE_UNICODE = /[\u200b\u200c\u200d\u200e\u200f\ufeff\u00ad]/;

/**
 * Scans content for security issues. Returns a rejection reason string if
 * problematic, or null if safe.
 */
export function scanContent(content: string): string | null {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      return `Content rejected: possible prompt injection pattern detected`;
    }
  }
  for (const pattern of CREDENTIAL_PATTERNS) {
    if (pattern.test(content)) {
      return `Content rejected: possible credential pattern detected`;
    }
  }
  if (INVISIBLE_UNICODE.test(content)) {
    return `Content rejected: invisible Unicode characters detected`;
  }
  return null;
}

// ─── Memory tool helpers ──────────────────────────────────────────────────────

export interface MemoryFilePaths {
  memoryPath: string;
  userPath: string;
}

export function getTargetInfo(
  target: string,
  paths: MemoryFilePaths
): { path: string; header: string } | null {
  if (target === 'memory') return { path: paths.memoryPath, header: MEMORY_HEADER };
  if (target === 'user') return { path: paths.userPath, header: USER_HEADER };
  return null;
}

export function memoryAdd(
  paths: MemoryFilePaths,
  target: string,
  content: string,
  charLimit: number
): string {
  const rejection = scanContent(content);
  if (rejection) return rejection;

  const info = getTargetInfo(target, paths);
  if (!info) return `Unknown target: ${target}. Use 'memory' or 'user'.`;

  const current = readMemoryFile(info.path);
  const entries = getEntries(current, info.header);

  // Duplicate check
  if (entries.includes(content.trim())) {
    return `No duplicate added — entry already exists`;
  }

  const newEntries = [...entries, content.trim()];
  const newContent = buildContent(newEntries, info.header);

  if (newContent.length > charLimit) {
    return (
      `Capacity error: adding this entry would exceed the ${charLimit}-char limit ` +
      `(current: ${current.length} chars, limit: ${charLimit}).\n` +
      `Current entries:\n${entries.map((e, i) => `${i + 1}. ${e}`).join('\n')}\n` +
      `Please remove or consolidate entries first.`
    );
  }

  writeFileSync(info.path, newContent, 'utf-8');
  const label = info.path.endsWith('MEMORY.md') ? 'MEMORY.md' : 'USER.md';
  return `Added. ${label} now ${newContent.length}/${charLimit} chars.`;
}

export function memoryReplace(
  paths: MemoryFilePaths,
  target: string,
  oldText: string,
  content: string,
  charLimit: number
): string {
  const rejection = scanContent(content);
  if (rejection) return rejection;

  const info = getTargetInfo(target, paths);
  if (!info) return `Unknown target: ${target}. Use 'memory' or 'user'.`;

  const current = readMemoryFile(info.path);
  const entries = getEntries(current, info.header);

  const matches = entries.filter((e) => e.includes(oldText));
  if (matches.length === 0) return `No entry found containing: "${oldText}"`;
  if (matches.length > 1) {
    return (
      `Ambiguous match: ${matches.length} entries contain "${oldText}". ` +
      `Use a more specific substring.\nMatches:\n${matches.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
    );
  }

  const newEntries = entries.map((e) => (e.includes(oldText) ? content.trim() : e));
  const newContent = buildContent(newEntries, info.header);

  if (newContent.length > charLimit) {
    return `Capacity error: replacement would exceed the ${charLimit}-char limit.`;
  }

  writeFileSync(info.path, newContent, 'utf-8');
  const label = info.path.endsWith('MEMORY.md') ? 'MEMORY.md' : 'USER.md';
  return `Replaced. ${label} now ${newContent.length}/${charLimit} chars.`;
}

export function memoryRemove(
  paths: MemoryFilePaths,
  target: string,
  oldText: string,
  charLimit: number
): string {
  const info = getTargetInfo(target, paths);
  if (!info) return `Unknown target: ${target}. Use 'memory' or 'user'.`;

  const current = readMemoryFile(info.path);
  const entries = getEntries(current, info.header);

  const matches = entries.filter((e) => e.includes(oldText));
  if (matches.length === 0) return `No entry found containing: "${oldText}"`;
  if (matches.length > 1) {
    return (
      `Ambiguous match: ${matches.length} entries contain "${oldText}". ` +
      `Use a more specific substring.\nMatches:\n${matches.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
    );
  }

  const newEntries = entries.filter((e) => !e.includes(oldText));
  const newContent = buildContent(newEntries, info.header);

  writeFileSync(info.path, newContent, 'utf-8');
  const label = info.path.endsWith('MEMORY.md') ? 'MEMORY.md' : 'USER.md';
  return `Removed. ${label} now ${newContent.length}/${charLimit} chars.`;
}

// ─── System prompt injection ──────────────────────────────────────────────────

export function buildMemoryBlock(
  memoryContent: string,
  userContent: string,
  memoryCharLimit: number,
  userCharLimit: number
): string {
  const memChars = memoryContent.length;
  const userChars = userContent.length;
  const memPct = Math.round((memChars / memoryCharLimit) * 100);
  const userPct = Math.round((userChars / userCharLimit) * 100);

  const SEP = '══════════════════════════════════════════════';

  return (
    `\n${SEP}\n` +
    `MEMORY (your personal notes) [${memPct}% — ${memChars}/${memoryCharLimit} chars]\n` +
    `${SEP}\n` +
    (memoryContent.trim() || '(empty)') +
    `\n\n${SEP}\n` +
    `USER PROFILE [${userPct}% — ${userChars}/${userCharLimit} chars]\n` +
    `${SEP}\n` +
    (userContent.trim() || '(empty)') +
    `\n`
  );
}

// ─── Session search ───────────────────────────────────────────────────────────

export interface SearchRow {
  role: string;
  created_at: string;
  excerpt: string;
}

export function runSessionSearch(
  db: Database.Database,
  query: string,
  limit: number
): SearchRow[] {
  try {
    const rows = db
      .prepare(
        `SELECT m.role, m.created_at,
                snippet(messages_fts, 0, '[', ']', '...', 20) AS excerpt
         FROM messages_fts
         JOIN messages m ON m.rowid = messages_fts.rowid
         WHERE messages_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(query, limit) as SearchRow[];
    return rows;
  } catch {
    return [];
  }
}

// ─── Consolidation ───────────────────────────────────────────────────────────

export interface ConsolidationOptions {
  db: Database.Database;
  memoriesDir: string;
  memoryCharLimit: number;
  userCharLimit: number;
  /** Injected LLM call for testability. Receives prompt, returns string response. */
  llmCall: (prompt: string) => Promise<string>;
}

/**
 * Parses an LLM consolidation response into memory operations.
 * Expected format: one operation per line:
 *   ADD memory: <content>
 *   ADD user: <content>
 *   REPLACE memory: <old_text> -> <new_content>
 *   REMOVE memory: <old_text>
 */
export function parseConsolidationOps(
  response: string
): Array<{ action: 'add' | 'replace' | 'remove'; target: 'memory' | 'user'; content?: string; oldText?: string }> {
  const ops: Array<{ action: 'add' | 'replace' | 'remove'; target: 'memory' | 'user'; content?: string; oldText?: string }> = [];

  for (const line of response.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // ADD memory: <content>
    const addMatch = trimmed.match(/^ADD\s+(memory|user):\s+(.+)$/i);
    if (addMatch) {
      ops.push({
        action: 'add',
        target: addMatch[1].toLowerCase() as 'memory' | 'user',
        content: addMatch[2].trim(),
      });
      continue;
    }

    // REPLACE memory: <old_text> -> <new_content>
    const replaceMatch = trimmed.match(/^REPLACE\s+(memory|user):\s+(.+?)\s+->\s+(.+)$/i);
    if (replaceMatch) {
      ops.push({
        action: 'replace',
        target: replaceMatch[1].toLowerCase() as 'memory' | 'user',
        oldText: replaceMatch[2].trim(),
        content: replaceMatch[3].trim(),
      });
      continue;
    }

    // REMOVE memory: <old_text>
    const removeMatch = trimmed.match(/^REMOVE\s+(memory|user):\s+(.+)$/i);
    if (removeMatch) {
      ops.push({
        action: 'remove',
        target: removeMatch[1].toLowerCase() as 'memory' | 'user',
        oldText: removeMatch[2].trim(),
      });
      continue;
    }
  }

  return ops;
}

/**
 * Runs the memory consolidation process.
 * Reads recent messages, calls LLM, applies resulting operations,
 * and writes a memory_log row.
 */
export async function runConsolidation(opts: ConsolidationOptions): Promise<void> {
  const { db, memoriesDir, memoryCharLimit, userCharLimit, llmCall } = opts;

  const paths: MemoryFilePaths = {
    memoryPath: join(memoriesDir, 'MEMORY.md'),
    userPath: join(memoriesDir, 'USER.md'),
  };

  // Read current memory state (before)
  const memBefore = readMemoryFile(paths.memoryPath);
  const userBefore = readMemoryFile(paths.userPath);

  // Read messages since last consolidation run
  let since: string | undefined;
  try {
    const lastLog = db
      .prepare('SELECT ran_at FROM memory_log ORDER BY id DESC LIMIT 1')
      .get() as { ran_at: string } | undefined;
    if (lastLog) {
      since = lastLog.ran_at;
    }
  } catch {
    // memory_log table may not exist in some test setups
  }

  let messages: Array<{ role: string; content: string; created_at: string }>;
  try {
    if (since) {
      messages = db
        .prepare(`SELECT role, content, created_at FROM messages WHERE created_at > ? ORDER BY created_at LIMIT 200`)
        .all(since) as Array<{ role: string; content: string; created_at: string }>;
    } else {
      messages = db
        .prepare(`SELECT role, content, created_at FROM messages ORDER BY created_at LIMIT 200`)
        .all() as Array<{ role: string; content: string; created_at: string }>;
    }
  } catch {
    messages = [];
  }

  // Count unique context sessions processed
  const sessionsProcessed = messages.length > 0 ? 1 : 0;

  // Build consolidation prompt
  const conversationExcerpt = messages
    .slice(0, 50)
    .map((m) => `[${m.role}] ${m.content.slice(0, 200)}`)
    .join('\n');

  const prompt =
    `You are a memory consolidation assistant. Analyse the following recent conversation excerpts ` +
    `and the current memory contents, then identify new facts, preferences, corrections, or patterns ` +
    `that should be added, updated, or removed from memory.\n\n` +
    `CURRENT MEMORY.md:\n${memBefore || '(empty)'}\n\n` +
    `CURRENT USER.md:\n${userBefore || '(empty)'}\n\n` +
    `RECENT CONVERSATIONS:\n${conversationExcerpt || '(no new messages)'}\n\n` +
    `Respond with memory operations, one per line, using this format:\n` +
    `  ADD memory: <new entry>\n` +
    `  ADD user: <new entry>\n` +
    `  REPLACE memory: <old text> -> <new text>\n` +
    `  REMOVE memory: <old text>\n` +
    `Only include operations that add genuine new value. If nothing to add, say "No new insights to add."\n`;

  // Call LLM
  const response = await llmCall(prompt);

  // Parse and apply operations
  const ops = parseConsolidationOps(response);
  let opsApplied = 0;
  let autoCapacityFired = false;

  for (const op of ops) {
    const charLimit = op.target === 'memory' ? memoryCharLimit : userCharLimit;
    let result: string;

    if (op.action === 'add' && op.content) {
      result = memoryAdd(paths, op.target, op.content, charLimit);

      // If capacity error, trigger auto-consolidation
      if (result.includes('Capacity error')) {
        autoCapacityFired = true;
        const currentContent = readMemoryFile(
          op.target === 'memory' ? paths.memoryPath : paths.userPath
        );
        const targetHeader = op.target === 'memory' ? MEMORY_HEADER : USER_HEADER;

        const autoPrompt =
          `The memory file has reached capacity. Please produce a consolidated version of the ` +
          `existing entries combined with the new insight, fitting within ${charLimit} characters ` +
          `(including the file header "${targetHeader.trim()}").\n\n` +
          `Current content:\n${currentContent}\n\n` +
          `New insight to incorporate: ${op.content}\n\n` +
          `Return ONLY the consolidated content lines (no header, no formatting markers), ` +
          `one entry per line, within the character limit.`;

        const consolidatedResponse = await llmCall(autoPrompt);

        // Write the consolidated content as full replacement
        const newEntries = consolidatedResponse
          .split('\n')
          .map((l: string) => l.replace(/^CONSOLIDATED:\s*/i, '').trimEnd())
          .filter((l: string) => l.length > 0);
        const newContent = buildContent(newEntries, targetHeader);

        // Write if within limit
        if (newContent.length <= charLimit) {
          const filePath = op.target === 'memory' ? paths.memoryPath : paths.userPath;
          writeFileSync(filePath, newContent, 'utf-8');
          opsApplied++;

          // Write auto-capacity log row immediately
          const memNow = readMemoryFile(paths.memoryPath);
          const userNow = readMemoryFile(paths.userPath);
          try {
            db.prepare(
              `INSERT INTO memory_log (trigger, sessions_processed, ops_applied, memory_chars_before, memory_chars_after, user_chars_before, user_chars_after)
               VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(
              'auto-capacity',
              sessionsProcessed,
              opsApplied,
              memBefore.length,
              memNow.length,
              userBefore.length,
              userNow.length
            );
          } catch {
            // swallow
          }
        }
        continue;
      }
    } else if (op.action === 'replace' && op.oldText && op.content) {
      result = memoryReplace(paths, op.target, op.oldText, op.content, charLimit);
    } else if (op.action === 'remove' && op.oldText) {
      result = memoryRemove(paths, op.target, op.oldText, charLimit);
    } else {
      continue;
    }

    // Count successful operations (not errors)
    if (!result.includes('error') && !result.includes('Error') && !result.includes('rejected') && !result.includes('Ambiguous') && !result.includes('No entry found') && !result.includes('Capacity error')) {
      opsApplied++;
    }
  }

  // Read state after
  const memAfter = readMemoryFile(paths.memoryPath);
  const userAfter = readMemoryFile(paths.userPath);

  // Write memory_log row (only if auto-capacity didn't already write one)
  if (!autoCapacityFired) {
    try {
      db.prepare(
        `INSERT INTO memory_log (trigger, sessions_processed, ops_applied, memory_chars_before, memory_chars_after, user_chars_before, user_chars_after)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'consolidation',
        sessionsProcessed,
        opsApplied,
        memBefore.length,
        memAfter.length,
        userBefore.length,
        userAfter.length
      );
    } catch {
      // Swallow log write errors — don't break consolidation
    }
  }
}

// ─── Extension factory (testable) ────────────────────────────────────────────

/**
 * Core extension factory — accepts an optional `memoriesDir` override for tests.
 * Production code uses the default path (~/.reeboot/memories).
 */
export function makeMemoryExtension(
  pi: ExtensionAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any = {},
  memoriesDirOverride?: string
): void {
  const memoryConfig = config.memory ?? {
    enabled: true,
    memoryCharLimit: 2200,
    userCharLimit: 1375,
    consolidation: { enabled: true, schedule: '0 2 * * *' },
  };

  const memoriesDir = memoriesDirOverride ?? join(homedir(), '.reeboot', 'memories');

  // Init memory files if memory is enabled
  if (memoryConfig.enabled) {
    initMemoryFiles(memoriesDir);
  }

  // ── Consolidation task registration ─────────────────────────────────────
  if (memoryConfig.enabled && memoryConfig.consolidation?.enabled) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { globalScheduler } = require('../scheduler-registry.js') as typeof import('../scheduler-registry.js');
    const scheduler = globalScheduler;
    if (scheduler) {
      scheduler.registerJob({
        id: '__memory_consolidation__',
        contextId: 'main',
        schedule: memoryConfig.consolidation.schedule ?? '0 2 * * *',
        prompt:
          '__memory_consolidation__: Run the memory consolidation process. ' +
          'Analyse recent conversations and update MEMORY.md and USER.md with new insights.',
      });
    }
  }

  const paths: MemoryFilePaths = {
    memoryPath: join(memoriesDir, 'MEMORY.md'),
    userPath: join(memoriesDir, 'USER.md'),
  };

  // ── before_agent_start — inject frozen memory snapshot ──────────────────
  if (memoryConfig.enabled) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pi.on('before_agent_start', async (event: any) => {
      const memoryContent = readMemoryFile(paths.memoryPath);
      const userContent = readMemoryFile(paths.userPath);

      const block = buildMemoryBlock(
        memoryContent,
        userContent,
        memoryConfig.memoryCharLimit,
        memoryConfig.userCharLimit
      );

      return { systemPrompt: (event.systemPrompt ?? '') + block };
    });
  }

  // ── session_search tool — always registered ──────────────────────────────
  pi.registerTool({
    name: 'session_search',
    label: 'Session Search',
    description:
      'Full-text search over past conversation history. Returns matching messages with role, timestamp, and content excerpt.',
    parameters: Type.Object({
      query: Type.String({ description: 'Search terms to match against message history' }),
      limit: Type.Optional(
        Type.Number({
          description: 'Maximum number of results (default: 10)',
          minimum: 1,
          maximum: 100,
        })
      ),
    }),
    execute: async (_id, params) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getDb } = require('../db/index.js') as typeof import('../db/index.js');
      const db: Database.Database | undefined = (() => { try { return getDb(); } catch { return undefined; } })();
      if (!db) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ results: [], error: 'Database not available' }) }], details: {} };
      }
      const results = runSessionSearch(db, params.query, params.limit ?? 10);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ results }) }], details: {} };
    },
  });

  // ── memory tool — gated by memory.enabled ────────────────────────────────
  if (memoryConfig.enabled) {
    pi.registerTool({
      name: 'memory',
      label: 'Memory',
      description:
        'Manage persistent memory entries in MEMORY.md (agent notes) and USER.md (owner profile). ' +
        'Changes persist to disk immediately and are visible from the next session.',
      parameters: Type.Object({
        action: Type.Union(
          [Type.Literal('add'), Type.Literal('replace'), Type.Literal('remove')],
          { description: 'Action to perform: add, replace, or remove' }
        ),
        target: Type.Union(
          [Type.Literal('memory'), Type.Literal('user')],
          { description: 'Which file to update: "memory" (MEMORY.md) or "user" (USER.md)' }
        ),
        content: Type.Optional(
          Type.String({
            description: 'Content to add or the replacement text (required for add/replace)',
          })
        ),
        old_text: Type.Optional(
          Type.String({
            description: 'Substring to match for replace/remove actions',
          })
        ),
      }),
      execute: async (_id, params) => {
        const { action, target, content, old_text } = params;

        let result: string;

        if (action === 'add') {
          if (!content) {
            result = 'Error: content is required for add action';
          } else {
            const charLimit =
              target === 'memory' ? memoryConfig.memoryCharLimit : memoryConfig.userCharLimit;
            result = memoryAdd(paths, target, content, charLimit);
          }
        } else if (action === 'replace') {
          if (!old_text) {
            result = 'Error: old_text is required for replace action';
          } else if (!content) {
            result = 'Error: content is required for replace action';
          } else {
            const charLimit =
              target === 'memory' ? memoryConfig.memoryCharLimit : memoryConfig.userCharLimit;
            result = memoryReplace(paths, target, old_text, content, charLimit);
          }
        } else if (action === 'remove') {
          if (!old_text) {
            result = 'Error: old_text is required for remove action';
          } else {
            const charLimit =
              target === 'memory' ? memoryConfig.memoryCharLimit : memoryConfig.userCharLimit;
            result = memoryRemove(paths, target, old_text, charLimit);
          }
        } else {
          result = `Unknown action: ${action}`;
        }

        return { content: [{ type: 'text' as const, text: result }], details: {} };
      },
    });
  }
}

// ─── Extension default export ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function memoryManagerExtension(pi: ExtensionAPI, config?: any): void {
  makeMemoryExtension(pi, config ?? {});
}
