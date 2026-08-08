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

import type { ExtensionAPI } from './extension-api.js';
import type { ToolView } from '../structured-views.js';
import { MemoryManager, type MemoryProvider, type MemoryTarget, type MemoryScope, type MemoryRef, type MemoryHit, type CapabilityDef, type SessionTranscript, type StoreOptions, namespaceCapability, hasCapability, STANDARD_CAPABILITIES } from '../memory-provider.js';
import { scanContent as scanInjection } from '../security/injection-scanner.js';
import { declareExternalSourceTool } from '../security/external-tools.js';
import { Type } from 'typebox';
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { getLogger } from '../observability/logger.js';
import { setReebootModelConfig } from './memory-model-config.js';
import { parseHotMemoryFile, formatHotMemoryEntry, pruneEntries, HOT_MEMORY_HEADER } from './hot-memory.js';
import type Database from 'better-sqlite3';
import type { SchedulerToolsTarget } from '../scheduler.js';

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
 * Derive the hot-memory file path from a memory dir; hot memory lives beside
 * MEMORY.md/USER.md as hot-memory.md.
 */
export function hotMemoryPathFor(paths: MemoryFilePaths): string {
  return join(dirname(paths.memoryPath), 'hot-memory.md');
}

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

/** Map a scope to the builtin file target. 'both' defaults to 'memory' for write ops. */
export function scopeToTarget(scope: MemoryScope): MemoryTarget {
  if (scope === 'human') return 'user';
  return 'memory';
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
    // Wrap the query in double quotes for a phrase match. This safely escapes
    // all FTS5 special characters (dots, hyphens, brackets, colons, etc.)
    // that previously caused SQLITE_ERROR crashes. Double quotes inside the
    // query are doubled per FTS5 phrase-match escaping rules.
    const escaped = query.replace(/"/g, '""');
    const phraseQuery = `"${escaped}"`;
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
      .all(phraseQuery, limit) as SearchRow[];
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
  /** When provided, consolidation writes route through the provider contract
   *  (`provider.store/update/forget`) rather than direct file writes. */
  provider?: MemoryProvider;
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
 * Apply a single consolidation op through the active provider contract
 * (`provider.store/update/forget`), mapping op target → memory scope.
 * Returns a result string: `'ok'` on success, or the provider error message.
 */
async function applyOpViaProvider(
  provider: MemoryProvider,
  op: { action: 'add' | 'replace' | 'remove'; target: 'memory' | 'user'; content?: string; oldText?: string }
): Promise<string> {
  const scope: MemoryScope = op.target === 'user' ? 'human' : 'self';
  try {
    if (op.action === 'add' && op.content) {
      // Consolidation writes directly to cold (long-term) memory.
      await provider.store(scope, op.content, { source: 'consolidation' });
      return 'ok';
    }
    if (op.action === 'replace' && op.oldText && op.content) {
      await provider.update(scope, { id: op.oldText }, op.content);
      return 'ok';
    }
    if (op.action === 'remove' && op.oldText) {
      await provider.forget(scope, { id: op.oldText });
      return 'ok';
    }
    return 'skip';
  } catch (e) {
    return (e as Error).message;
  }
}

/**
 * Auto-consolidation when an ADD would exceed capacity — routed through the
 * provider (clear + store) rather than direct file writes.
 */
async function autoConsolidateViaProvider(
  provider: MemoryProvider,
  db: Database.Database,
  memoriesDir: string,
  target: 'memory' | 'user',
  insight: string,
  charLimit: number,
  llmCall: (prompt: string) => Promise<string>,
  sessionsProcessed: number,
  memBefore: string,
  userBefore: string
): Promise<boolean> {
  const scope: MemoryScope = target === 'user' ? 'human' : 'self';
  const filePath = target === 'memory' ? join(memoriesDir, 'MEMORY.md') : join(memoriesDir, 'USER.md');
  const targetHeader = target === 'memory' ? MEMORY_HEADER : USER_HEADER;
  const currentContent = readMemoryFile(filePath);

  const autoPrompt =
    `The memory file has reached capacity. Please produce a consolidated version of the ` +
    `existing entries combined with the new insight, fitting within ${charLimit} characters ` +
    `(including the file header "${targetHeader.trim()}").\n\n` +
    `Current content:\n${currentContent}\n\n` +
    `New insight to incorporate: ${insight}\n\n` +
    `Return ONLY the consolidated content lines (no header, no formatting markers), ` +
    `one entry per line, within the character limit.`;

  const consolidatedResponse = await llmCall(autoPrompt);
  const newEntries = consolidatedResponse
    .split('\n')
    .map((l: string) => l.replace(/^CONSOLIDATED:\s*/i, '').trimEnd())
    .filter((l: string) => l.length > 0);
  const newContent = buildContent(newEntries, targetHeader);

  if (newContent.length <= charLimit) {
    await provider.clear(scope);
    await provider.store(scope, newEntries.join('\n'));
    const memNow = readMemoryFile(filePath);
    const userNow = readMemoryFile(join(memoriesDir, 'USER.md'));
    try {
      db.prepare(
        `INSERT INTO memory_log (trigger, sessions_processed, ops_applied, memory_chars_before, memory_chars_after, user_chars_before, user_chars_after)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'auto-capacity',
        sessionsProcessed,
        1,
        memBefore.length,
        memNow.length,
        userBefore.length,
        userNow.length
      );
    } catch {
      // swallow
    }
    return true;
  }
  return false;
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

  const provider = opts.provider;

  for (const op of ops) {
    const charLimit = op.target === 'memory' ? memoryCharLimit : userCharLimit;
    let result: string;

    if (provider) {
      // Route through the provider contract — never direct file writes.
      result = await applyOpViaProvider(provider, op);
      if (op.action === 'add' && result.includes('Capacity error') && op.content) {
        // Auto-consolidation also routes through the provider.
        autoCapacityFired = await autoConsolidateViaProvider(
          provider, db, memoriesDir, op.target, op.content, charLimit, llmCall,
          sessionsProcessed, memBefore, userBefore
        );
        continue;
      }
      if (op.action === 'add' && result.includes('Capacity error')) {
        autoCapacityFired = true;
      }
    } else if (op.action === 'add' && op.content) {
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

// ─── Server jobs registration ────────────────────────────────────────────────

/**
 * Resolve the configured active provider the same way `makeMemoryExtension` does
 * (builtin base + factory registry + select/fallback). Shared by job registration
 * and the extension factory so both agree on which provider is active.
 */
export function resolveConfiguredProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any,
  memoriesDir: string
): { manager: MemoryManager; providerId: string } {
  const memoryConfig: any = config?.memory ?? { provider: 'builtin', enabled: true, providerConfig: {} };
  const mc = memoryConfig.providerConfig?.memoryCharLimit ?? memoryConfig.memoryCharLimit ?? 2200;
  const uc = memoryConfig.providerConfig?.userCharLimit ?? memoryConfig.userCharLimit ?? 1375;
  const paths: MemoryFilePaths = {
    memoryPath: join(memoriesDir, 'MEMORY.md'),
    userPath: join(memoriesDir, 'USER.md'),
  };
  const manager = new MemoryManager(builtinMemoryProvider(paths, { memory: mc, user: uc }));
  const providerId = memoryConfig.provider ?? 'builtin';
  if (providerId !== 'builtin') {
    const viaFactory = resolveProvider(providerFactoryRegistry, providerId, memoryConfig.providerConfig);
    if (viaFactory) manager.register(viaFactory);
  }
  manager.select(providerId);
  return { manager, providerId };
}

/**
 * Registers background cron jobs for the memory manager.
 * Called by bootstrap.ts at server start, after the scheduler is ready.
 *
 * Routed by capability: a provider declaring `selfConsolidating` owns its own
 * consolidation loop (dreem's Dream) → reeboot's job is skipped. A non-self-
 * consolidating provider (builtin) gets reeboot's job, which runs through the
 * provider contract (see runConsolidation).
 */
export function registerServerJobs(
  _db: Database.Database,
  _scheduler: SchedulerToolsTarget,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _config: any,
  memoriesDir: string = join(homedir(), '.reeboot', 'memories')
): void {
  const memoryConfig = _config?.memory;
  if (!memoryConfig?.enabled) return;

  // Capability gate — a backend that self-consolidates skips reeboot's job.
  const { manager } = resolveConfiguredProvider(_config, memoriesDir);
  if (hasCapability(manager.active, STANDARD_CAPABILITIES.selfConsolidating)) return;

  const builtinConfig = memoryConfig.providerConfig;
  // Discriminated-union shape (providerConfig) with fallback to the legacy flat shape.
  const consolidation = builtinConfig?.consolidation ?? memoryConfig.consolidation;
  if (!consolidation?.enabled) return;

  _scheduler.registerJob({
    id: '__memory_consolidation__',
    contextId: 'main',
    schedule: consolidation.schedule ?? '0 2 * * *',
    prompt:
      '__memory_consolidation__: Run the memory consolidation process. ' +
      'Analyse recent conversations and update MEMORY.md and USER.md with new insights.',
  });
}

// ─── Builtin memory provider ───────────────────────────────────────────────────

/**
 * The internal memory backend, exposed through the `MemoryProvider` seam so a
 * configured alternate provider (dreem, mem0, ...) can replace it without the
 * agent core knowing. Wraps the existing file-based MEMORY.md/USER.md logic,
 * reshaped onto the new action-shaped contract: scoped, ref-based, query-based
 * recall, provider-owned grounding.
 *
 * `ref.id` is the entry substring — the builtin's opaque handle. `update`/
 * `forget` locate the entry containing that substring (previously the direct
 * `old_text` surface, now addressed via an opaque ref).
 */

/**
 * Fold hot-memory under the provider as builtin's recall layer: match the query
 * against hot-memory entries (title/summary/conclusions) and return them as
 * self-scoped MemoryHits so the consumer gets hot+cold from one recall call.
 */
export function readHotHits(hotPath: string, query: string, limit?: number): MemoryHit[] {
  const content = readMemoryFile(hotPath);
  if (!content) return [];
  const entries = parseHotMemoryFile(content);
  if (entries.length === 0) return [];
  const q = query.toLowerCase();
  const matched = entries.filter((e) => {
    const blob = `${e.title} ${e.summary} ${e.conclusions ?? ''}`.toLowerCase();
    return blob.includes(q);
  });
  const sliced = limit && limit > 0 ? matched.slice(0, limit) : matched;
  return sliced.map((e) => ({
    ref: { id: e.title },
    scope: 'self' as MemoryScope,
    content: formatHotMemoryEntry(e).trim(),
  }));
}

/**
 * Serialize a single hot-memory entry to `hot-memory.md`, pruning to the rolling
 * window. This is the builtin provider's internal hot write path (used for
 * `source:'entry'`/`source:'session'` writes) — the provider owns hot vs cold.
 */
export function writeHotEntry(hotPath: string, entry: { title: string; summary: string; conclusions?: string }): void {
  const current = readMemoryFile(hotPath);
  const existing = parseHotMemoryFile(current);
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
  const newEntry = { date: dateStr, ...entry };
  const pruned = pruneEntries([newEntry, ...existing]);
  const formatted = pruned.map(formatHotMemoryEntry).join('');
  mkdirSync(dirname(hotPath), { recursive: true });
  writeFileSync(hotPath, HOT_MEMORY_HEADER + formatted, 'utf-8');
}

/** Derive a short hot-memory title from free-form content. */
function titleFrom(text: string): string {
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? text;
  const words = firstLine.split(/\s+/).filter(Boolean);
  return words.slice(0, 6).join(' ').slice(0, 60) || 'Session note';
}

export function builtinMemoryProvider(
  paths: MemoryFilePaths,
  limits: { memory: number; user: number },
  deps: { llmCall?: (prompt: string) => Promise<string> } = {}
): MemoryProvider {
  const scopeTarget = (scope: MemoryScope): MemoryTarget => scopeToTarget(scope);
  const hotPath = hotMemoryPathFor(paths);

  /** Distill a raw session transcript into hot memory (provider-owned distillation). */
  const storeSession = async (transcript: SessionTranscript): Promise<MemoryRef> => {
    const text = transcript
      .map((t) => `[${t.role}] ${t.content}`)
      .join('\n');
    const rejection = scanContent(text);
    if (rejection) throw new Error(rejection);

    const excerpt = text.slice(0, 4000);
    if (deps.llmCall) {
      try {
        const { parseDistillResponse } = await import('./hot-memory.js');
        const prompt =
          'Generate a 2-3 line summary of this conversation. Include the main topic, ' +
          'key conclusions, and any open threads. Be brief. Then suggest a short title ' +
          '(max 6 words).\n' +
          'Format:\n' +
          'TITLE: <title>\n' +
          'SUMMARY: <summary>\n' +
          'CONCLUSIONS: <conclusions>\n' +
          'If nothing noteworthy to summarize, respond with "NO_NEW_INSIGHTS".\n\n' +
          `CONVERSATION:\n${excerpt}`;
        const response = await deps.llmCall(prompt);
        const entry = parseDistillResponse(response);
        if (entry) {
          writeHotEntry(hotPath, {
            title: entry.title,
            summary: entry.summary,
            conclusions: entry.conclusions,
          });
          return { id: entry.title };
        }
      } catch {
        // best-effort distillation — fall through to direct hot write below
      }
    }

    // Fallback: no LLM available or distillation failed — record the raw
    // transcript as a hot entry so no session is silently dropped.
    writeHotEntry(hotPath, { title: titleFrom(text), summary: text.slice(0, 500) });
    return { id: text.trim() };
  };

  return {
    id: 'builtin',
    async store(scope: MemoryScope, content: string | SessionTranscript, opts?: StoreOptions): Promise<MemoryRef> {
      const source = opts?.source ?? 'entry';

      // `session` — a raw transcript the provider distills into hot memory.
      if (source === 'session') {
        return storeSession(content as SessionTranscript);
      }

      // `entry` (default) — everything is hot first: write to hot memory.
      if (source === 'entry') {
        const text = typeof content === 'string' ? content : String(content);
        const rejection = scanContent(text);
        if (rejection) throw new Error(rejection);
        writeHotEntry(hotPath, { title: titleFrom(text), summary: text });
        return { id: text.trim() };
      }

      // `consolidation` — write directly to cold (long-term) memory.
      const coldContent = typeof content === 'string' ? content : String(content);
      const target = scopeTarget(scope);
      const info = getTargetInfo(target, paths);
      if (!info) throw new Error(`Unknown scope: ${scope}`);

      const rejection = scanContent(coldContent);
      if (rejection) throw new Error(rejection);

      const current = readMemoryFile(info.path);
      const entries = getEntries(current, info.header);

      if (entries.includes(coldContent.trim())) {
        throw new Error('No duplicate added — entry already exists');
      }

      const newEntries = [...entries, coldContent.trim()];
      const newContent = buildContent(newEntries, info.header);

      if (newContent.length > limits[target]) {
        throw new Error(
          `Capacity error: adding this entry would exceed the ${limits[target]}-char limit ` +
            `(current: ${current.length} chars, limit: ${limits[target]}).`
        );
      }

      writeFileSync(info.path, newContent, 'utf-8');
      return { id: coldContent.trim() };
    },
    async update(scope: MemoryScope, ref: MemoryRef, content: string) {
      const target = scopeTarget(scope);
      const info = getTargetInfo(target, paths);
      if (!info) throw new Error(`Unknown scope: ${scope}`);

      const rejection = scanContent(content);
      if (rejection) throw new Error(rejection);

      const current = readMemoryFile(info.path);
      const entries = getEntries(current, info.header);
      const matches = entries.filter((e) => e.includes(ref.id));
      if (matches.length === 0) throw new Error(`No entry found containing: "${ref.id}"`);
      if (matches.length > 1) {
        throw new Error(`Ambiguous match: ${matches.length} entries contain "${ref.id}". Use a more specific substring.`);
      }

      const newEntries = entries.map((e) => (e.includes(ref.id) ? content.trim() : e));
      const newContent = buildContent(newEntries, info.header);
      if (newContent.length > limits[target]) {
        throw new Error(`Capacity error: replacement would exceed the ${limits[target]}-char limit.`);
      }
      writeFileSync(info.path, newContent, 'utf-8');
    },
    async forget(scope: MemoryScope, ref: MemoryRef) {
      const target = scopeTarget(scope);
      const info = getTargetInfo(target, paths);
      if (!info) throw new Error(`Unknown scope: ${scope}`);

      const current = readMemoryFile(info.path);
      const entries = getEntries(current, info.header);
      const matches = entries.filter((e) => e.includes(ref.id));
      if (matches.length === 0) throw new Error(`No entry found containing: "${ref.id}"`);
      if (matches.length > 1) {
        throw new Error(`Ambiguous match: ${matches.length} entries contain "${ref.id}". Use a more specific substring.`);
      }

      const newEntries = entries.filter((e) => !e.includes(ref.id));
      writeFileSync(info.path, buildContent(newEntries, info.header), 'utf-8');
    },
    async recall(scope: MemoryScope, query: string, limit?: number): Promise<MemoryHit[]> {
      const readTarget = (target: MemoryTarget) => {
        const info = getTargetInfo(target, paths);
        return info ? getEntries(readMemoryFile(info.path), info.header) : [];
      };

      const q = query.toLowerCase();
      const match = (entry: string) => entry.toLowerCase().includes(q);
      const toHits = (entries: string[], s: MemoryScope) =>
        entries.filter(match).slice(0, limit).map((e) => ({
          ref: { id: e },
          scope: s,
          content: e,
        }));

      // builtin owns the hot-vs-cold split internally: hot-memory entries are a
      // recall layer folded under the provider, so the consumer never cares which
      // backing store held the match.
      const hotHits = readHotHits(hotMemoryPathFor(paths), query, limit ?? 0);

      if (scope === 'both') {
        return [
          ...toHits(readTarget('memory'), 'self'),
          ...toHits(readTarget('user'), 'human'),
          ...hotHits,
        ];
      }
      if (scope === 'self') {
        return [...toHits(readTarget('memory'), 'self'), ...hotHits];
      }
      return toHits(readTarget(scopeTarget(scope)), scope);
    },
    async clear(scope: MemoryScope) {
      const targets: MemoryTarget[] = scope === 'both' ? ['memory', 'user'] : [scopeTarget(scope)];
      for (const target of targets) {
        const info = getTargetInfo(target, paths);
        if (info) writeFileSync(info.path, info.header, 'utf-8');
      }
    },
    async grounding(opts?: { scope?: MemoryScope; maxChars?: number }): Promise<string> {
      const coldBlock = buildMemoryBlock(
        readMemoryFile(paths.memoryPath),
        readMemoryFile(paths.userPath),
        limits.memory,
        limits.user
      );
      // Provider owns the hot-vs-cold split: hot (working/session) memory is
      // surfaced alongside cold (long-term) memory in the same digest. Order is
      // hot-then-cold (working memory first, then long-term), per the contract.
      const hotContent = readMemoryFile(hotPath);
      const hotBlock = hotContent.trim()
        ? '\n' + ['[HOT MEMORY]', 'Below are brief summaries of your last few sessions.', '', hotContent.trim()].join('\n') + '\n'
        : '';
      let block = hotBlock + coldBlock;
      if (opts?.maxChars && block.length > opts.maxChars) return block.slice(0, opts.maxChars);
      return block;
    },
    listCapabilities(): CapabilityDef[] {
      // builtin declares its hot-memory/recall-enhancement capability (reeboot's
      // hot-memory extension is builtin's recall layer) and is NOT self-consolidating.
      return [
        {
          name: 'hot-memory',
          description: 'Recall enhancement across session boundaries via hot-memory summaries.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Short title for the hot-memory entry.' },
              summary: { type: 'string', description: 'Concise summary to persist.' },
              conclusions: { type: 'string', description: 'Optional conclusions / open threads.' },
            },
            required: ['title', 'summary'],
          },
          key: STANDARD_CAPABILITIES.hotMemory,
          async execute(params: any) {
            const title = typeof params?.title === 'string' ? params.title : '';
            const summary = typeof params?.summary === 'string' ? params.summary : '';
            const conclusions = typeof params?.conclusions === 'string' ? params.conclusions : undefined;
            if (!title || !summary) {
              return { ok: false, error: 'title and summary are required' };
            }
            // Consume the input defensively (trust boundary): do not let injected
            // content become a new injection vector when persisted/handled later.
            const rejection = scanContent(`${title}\n${summary}\n${conclusions ?? ''}`);
            if (rejection) return { ok: false, error: rejection };
            writeHotEntry(hotPath, { title, summary, conclusions });
            return { ok: true, title };
          },
        },
      ];
    },
  };
}

// ─── Provider factory registry ──────────────────────────────────────────────
// Constructs the selected provider from its parsed, typed `providerConfig`.
// A factory receives the typed providerConfig for the selected provider and
// returns a constructed `MemoryProvider` (or null to signal "unable to load").

export interface ProviderFactory {
  (providerConfig: unknown): MemoryProvider | null;
}

export interface ProviderFactoryRegistry {
  register(id: string, factory: ProviderFactory): void;
  get(id: string): ProviderFactory | undefined;
}

/** Create a fresh provider-factory registry (isolated for tests). */
export function createProviderFactoryRegistry(): ProviderFactoryRegistry {
  const factories = new Map<string, ProviderFactory>();
  return {
    register(id, factory) {
      factories.set(id, factory);
    },
    get(id) {
      return factories.get(id);
    },
  };
}

/** Global default provider-factory registry used by the memory extension. */
export const providerFactoryRegistry: ProviderFactoryRegistry = createProviderFactoryRegistry();

/** Register a factory on the global registry. */
export function registerProvider(id: string, factory: ProviderFactory): void {
  providerFactoryRegistry.register(id, factory);
}

/**
 * Resolve a provider id through the registry. Returns the constructed provider
 * or null when there is no factory (or the factory cannot construct it).
 */
export function resolveProvider(
  registry: ProviderFactoryRegistry,
  id: string,
  providerConfig: unknown
): MemoryProvider | null {
  const factory = registry.get(id);
  if (!factory) return null;
  const provider = factory(providerConfig);
  return provider ?? null;
}

// ─── Capability registry walk ────────────────────────────────────────────────

/**
 * Walks the active provider's declared capabilities and registers ONE namespaced
 * tool per capability — the same uniform mechanism for builtin, dreem, mem0, or
 * any future provider. Names are `memory::<providerId>::<name>`.
 *
 * Uniform trust gate ("a tool is a tool"): every declared tool passes through the
 * same governance as first-party tools — 1) schema validation, 2) injection
 * scanning, 3) minAuthLevel/permission-tier gating, 4) namespacing. Trust-enforcer
 * gating applies at runtime to ALL tools uniformly via the `tool_call` hook, so
 * provider tools are governed identically to first-party tools.
 */
export function registerCapabilityTools(
  pi: ExtensionAPI,
  manager: MemoryManager
): void {
  const providerId = manager.active.id;
  const logger = getLogger();
  // Capability-registry-trust S6: tools that surface backend memory content from
  // a NON-builtin provider are external-source content (builtin is the local
  // store, so its tools stay trusted). They are added to the external-source
  // registry so injection-guard's treat-as-data policy and output scanning apply.
  const external = providerId !== 'builtin';
  for (const cap of manager.listCapabilities()) {
    const name = namespaceCapability(providerId, cap.name);

    // Plie 1 — schema validation: reject malformed defs before they enter the list.
    if (!isValidCapabilityDef(cap)) {
      logger.warn(`[memory] capability '${cap.name}' rejected: malformed definition`);
      continue;
    }

    // Plie 2 — injection scanning: block injectable declared content.
    const scan = scanInjection(`${cap.description}\n${cap.name}`);
    if (scan.flagged) {
      logger.warn(`[memory] capability '${cap.name}' blocked: injection pattern detected`);
      continue;
    }

    // Piles 3+4 — permission-tier gating (minAuthLevel) + namespacing.
    if (external) declareExternalSourceTool(name);
    pi.registerTool({
      name,
      label: name,
      description: cap.description,
      parameters: (cap.parameters ?? {}) as never,
      minAuthLevel: cap.minAuthLevel ?? undefined,
      execute: async (_id, params) => {
        let result: unknown;
        if (cap.execute) {
          result = await cap.execute(params);
        } else {
          result = `[${name}] declared without a handler`;
        }
        // A provider may return a structured view (reeboot's view system) alongside
        // content for non-tool-schema surfaces — propagate it to the ToolResult.
        let view: ToolView | undefined;
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          const r = result as { content?: unknown; view?: ToolView };
          if (r.view !== undefined && r.view !== null) {
            view = r.view;
            result = r.content ?? '';
          }
        }
        const text = typeof result === 'string' ? result : JSON.stringify(result);
        return view !== undefined
          ? ({ content: [{ type: 'text' as const, text }], details: {}, view } as never)
          : { content: [{ type: 'text' as const, text }], details: {} };
      },
    });
  }
}

/** Minimal structural validation for a provider-declared capability tool. */
export function isValidCapabilityDef(cap: CapabilityDef): boolean {
  return (
    typeof cap === 'object' &&
    cap !== null &&
    typeof cap.name === 'string' &&
    cap.name.length > 0 &&
    typeof cap.description === 'string' &&
    cap.description.length > 0 &&
    cap.parameters != null
  );
}

// ─── Extension factory (testable) ────────────────────────────────────────────

/**
 * Core extension factory — accepts an optional `memoriesDir` override for tests.
 * Production code uses the default path (~/.reeboot/memories).
 */
/** True when this extension runs inside a restricted/remote runner turn. */
function isRestrictedTurn(pi: ExtensionAPI): boolean {
  return (pi as any).context?.restricted === true;
}

export function makeMemoryExtension(
  pi: ExtensionAPI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any = {},
  memoriesDirOverride?: string,
  extraProviders: MemoryProvider[] = []
): void {
  const memoryConfig: any = config.memory ?? {
    provider: 'builtin',
    enabled: true,
    providerConfig: {},
  };
  // Discriminated-union shape (providerConfig) with fallback to legacy flat shape.
  const memoryCharLimit = memoryConfig.providerConfig?.memoryCharLimit ?? memoryConfig.memoryCharLimit ?? 2200;
  const userCharLimit = memoryConfig.providerConfig?.userCharLimit ?? memoryConfig.userCharLimit ?? 1375;

  const memoriesDir = memoriesDirOverride ?? join(homedir(), '.reeboot', 'memories');

  // Init memory files if memory is enabled
  if (memoryConfig.enabled) {
    initMemoryFiles(memoriesDir);
  }



  const paths: MemoryFilePaths = {
    memoryPath: join(memoriesDir, 'MEMORY.md'),
    userPath: join(memoriesDir, 'USER.md'),
  };

  // ── Memory provider seam ────────────────────────────────────────────────
  // Exactly one provider is active. The builtin backend is the default and the
  // fallback whenever a configured provider is unknown/unavailable.
  const manager = new MemoryManager(
    builtinMemoryProvider(paths, {
      memory: memoryCharLimit,
      user: userCharLimit,
    })
  );
  for (const p of extraProviders) manager.register(p);
  const providerId = memoryConfig.provider ?? 'builtin';
  // Construct the configured provider through the factory registry from the typed
  // providerConfig; a null result means "unloadable" → manager falls back to builtin.
  const viaFactory = resolveProvider(providerFactoryRegistry, providerId, memoryConfig.providerConfig);
  if (viaFactory) manager.register(viaFactory);
  manager.select(providerId);

  // Surface reeboot's active model config so the provider can share reeboot's LLM
  // (unless providerConfig.llm overrides).
  setReebootModelConfig((config as any)?.agent?.model);

  // ── before_agent_start — inject frozen memory snapshot ──────────────────
  if (memoryConfig.enabled) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pi.on('before_agent_start', async (event: any) => {
      const block = await manager.grounding();

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
      const db: Database.Database | undefined = await (async () => {
        try {
          const { getDb } = await import('../db/index.js');
          return getDb();
        } catch {
          return undefined;
        }
      })();
      if (!db) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ results: [], error: 'Database not available' }) }], details: {} };
      }
      const results = runSessionSearch(db, params.query, params.limit ?? 10);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ results }) }], details: {} };
    },
  });

  // ── memory tool — gated by memory.enabled; write tool is OWNER-ONLY ────
  // (skipped for restricted/remote runners so a remote turn cannot rewrite memory)
  if (memoryConfig.enabled && !isRestrictedTurn(pi)) {
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

        const scope: MemoryScope = target === 'user' ? 'human' : 'self';
        let result: string;

        if (action === 'add') {
          if (!content) {
            result = 'Error: content is required for add action';
          } else {
            try {
              // Everything is hot first (Option B): the explicit memory tool lands
              // in the provider's hot (working) memory as an 'entry'. Promotion to
              // cold long-term memory is the consolidation job's decision.
              await manager.store(scope, content, { source: 'entry' });
              result = `Added to ${target === 'user' ? 'USER.md' : 'MEMORY.md'}.`;
            } catch (e) {
              result = (e as Error).message;
            }
          }
        } else if (action === 'replace') {
          if (!old_text) {
            result = 'Error: old_text is required for replace action';
          } else if (!content) {
            result = 'Error: content is required for replace action';
          } else {
            try {
              await manager.update(scope, { id: old_text }, content);
              result = `Replaced in ${target === 'user' ? 'USER.md' : 'MEMORY.md'}.`;
            } catch (e) {
              result = (e as Error).message;
            }
          }
        } else if (action === 'remove') {
          if (!old_text) {
            result = 'Error: old_text is required for remove action';
          } else {
            try {
              await manager.forget(scope, { id: old_text });
              result = `Removed from ${target === 'user' ? 'USER.md' : 'MEMORY.md'}.`;
            } catch (e) {
              result = (e as Error).message;
            }
          }
        } else {
          result = `Unknown action: ${action}`;
        }

        return { content: [{ type: 'text' as const, text: result }], details: {} };
      },
    });
  }

  // ── session_shutdown — forward the full conversation to the provider ───
  // The manager assembles the raw transcript from the messages log and hands it
  // to the active provider through the contract's single store action with the
  // `session` source signal. Distillation is a provider job (builtin LLM-distills
  // to hot; a delegating provider ingests the raw session). The manager never
  // distills on the provider's behalf.
  pi.on('session_shutdown', async (event: any) => {
    if (event.reason !== 'new') return;

    try {
      const { getDb } = await import('../db/index.js');
      const db: Database.Database | undefined = getDb();
      if (!db) return;

      // Forward the FULL conversation transcript — no cap. Distillation is the
      // provider's job (builtin truncates internally; a delegating backend
      // ingests the raw session), so the manager must not hard-cut it here.
      const rows = db.prepare(
        `SELECT role, content, created_at FROM messages ORDER BY created_at DESC`
      ).all() as Array<{ role: string; content: string; created_at: string }>;
      if (rows.length === 0) return;

      const transcript: SessionTranscript = rows.reverse().map((r) => ({
        role: r.role,
        content: r.content,
        created_at: r.created_at,
      }));
      await manager.store('self', transcript, { source: 'session' });
    } catch {
      // best-effort — never fail teardown because a session could not be forwarded
    }
  });

  // ── Provider capability registry — one namespaced tool per declaration ───
  registerCapabilityTools(pi, manager);
}

// ─── Extension default export ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function memoryManagerExtension(pi: ExtensionAPI, config?: any): void {
  makeMemoryExtension(pi, config ?? {});
}
