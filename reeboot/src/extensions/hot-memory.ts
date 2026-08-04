/**
 * Hot Memory Extension
 *
 * Bridges session boundaries by distilling recent conversations into brief
 * summaries (hot memory) that are injected into the agent's system prompt
 * on every new session start.
 *
 * Lifecycle:
 *   session_shutdown (reason: 'new') → distill session → write to hot-memory.md
 *   before_agent_start               → read hot-memory.md → inject into system prompt
 *
 * Hot memory is a rolling window of the last 4-6 sessions (~2-3 days),
 * stored in ~/.reeboot/memories/hot-memory.md — separate from MEMORY.md/USER.md.
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ─── Constants ────────────────────────────────────────────────────────────────

export const HOT_MEMORY_HEADER = '# HOT MEMORY — Recent Sessions\n\n';
const DEFAULT_MAX_ENTRIES = 6;
const DEFAULT_MAX_DAYS = 3;
const MIN_ENTRIES = 4;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HotMemoryEntry {
  date: string;
  title: string;
  summary: string;
  conclusions?: string;
}

// ─── initHotMemoryFile ───────────────────────────────────────────────────────

/**
 * Creates the hot-memory.md file with the header if it doesn't already exist.
 * Idempotent — never overwrites an existing file.
 */
export function initHotMemoryFile(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, 'hot-memory.md');
  if (!existsSync(filePath)) {
    writeFileSync(filePath, HOT_MEMORY_HEADER, 'utf-8');
  }
}

// ─── readHotMemoryFile ───────────────────────────────────────────────────────

/**
 * Reads the hot-memory.md file content. Returns empty string if the file
 * doesn't exist.
 */
export function readHotMemoryFile(dir: string): string {
  const filePath = join(dir, 'hot-memory.md');
  if (!existsSync(filePath)) return '';
  return readFileSync(filePath, 'utf-8');
}

// ─── formatHotMemoryEntry ─────────────────────────────────────────────────────

/**
 * Formats a HotMemoryEntry into a markdown block suitable for hot-memory.md.
 *
 * Format:
 *   ## date — title
 *   Summary: <summary>
 *   Conclusions: <conclusions>  (optional)
 */
export function formatHotMemoryEntry(entry: HotMemoryEntry): string {
  const lines: string[] = [
    `## ${entry.date} — ${entry.title}`,
    `Summary: ${entry.summary}`,
  ];
  if (entry.conclusions) {
    lines.push(`Conclusions: ${entry.conclusions}`);
  }
  return lines.join('\n') + '\n\n';
}

// ─── pruneEntries ─────────────────────────────────────────────────────────────

/**
 * Prune entries to fit within the rolling window bounds.
 *
 * Rules:
 * 1. Remove entries older than `maxDays` unless that would leave fewer than
 *    `minEntries` (default 4).
 * 2. If still over `maxEntries`, keep the `maxEntries` most recent.
 * 3. Return entries sorted by date descending (most recent first).
 */
export function pruneEntries(
  entries: HotMemoryEntry[],
  maxEntries: number = DEFAULT_MAX_ENTRIES,
  maxDays: number = DEFAULT_MAX_DAYS,
): HotMemoryEntry[] {
  if (entries.length === 0) return [];

  const minEntries = Math.min(MIN_ENTRIES, maxEntries);
  const now = Date.now();
  const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;

  // Sort by date descending (most recent first)
  const sorted = [...entries].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA;
  });

  // Step 1: remove old entries unless it would go below minEntries
  const ageFiltered = sorted.filter((e) => {
    const age = now - new Date(e.date).getTime();
    return age < maxAgeMs;
  });

  // If age filtering would leave too few, keep the most recent up to minEntries
  const combined = ageFiltered.length >= minEntries
    ? ageFiltered
    : sorted.slice(0, minEntries);

  // Step 2: cap at maxEntries
  return combined.slice(0, maxEntries);
}

// ─── buildHotMemoryBlock ──────────────────────────────────────────────────────

const INSTRUCTIONS = `If the user references a past conversation:
  1. Check this hot memory for a matching topic
  2. If found, call session_search with relevant terms to get full context
  3. Respond with the actual details from the past session
  4. If no match in hot memory, ask the user if it was from more than a few sessions ago
     and do a broader session_search`;

/**
 * Builds a system prompt block containing hot memory entries and retrieval
 * instructions. Returns empty string if content is empty.
 */
/**
 * Builds a system prompt block for hot memory awareness.
 *
 * Three cases:
 * 1. Content is empty (no file / first start) → returns '' (no injection).
 * 2. Content has only the header (file exists but no entries) → returns a
 *    minimal "no past records" awareness block so the agent knows it has
 *    no session history and should not call session_search.
 * 3. Content has entries → returns the full [HOT MEMORY] block with entries
 *    and session_search instructions.
 */
export function buildHotMemoryBlock(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';

  // Check if the content has actual entries (## date — title blocks)
  const entries = parseHotMemoryFile(content);
  if (entries.length === 0) {
    // File exists (header present) but no entries yet — first effective session
    return [
      '[HOT MEMORY]',
      'You have no past session records. Searching for past conversations will not yield results.',
    ].join('\n') + '\n';
  }

  return [
    '[HOT MEMORY]',
    'Below are brief summaries of your last few sessions.',
    INSTRUCTIONS,
    '',
    trimmed,
    '[END HOT MEMORY]',
  ].join('\n') + '\n';
}

// ─── distillSession ───────────────────────────────────────────────────────────

const DISTILL_SYSTEM_PROMPT =
  'Generate a 2-3 line summary of this conversation. Include the main topic, ' +
  'key conclusions, and any open threads. Be brief. Then suggest a short title ' +
  '(max 6 words).\n' +
  'Format:\n' +
  'TITLE: <title>\n' +
  'SUMMARY: <summary>\n' +
  'CONCLUSIONS: <conclusions>\n' +
  'If nothing noteworthy to summarize, respond with "NO_NEW_INSIGHTS".';

/**
 * Parse the LLM response into a HotMemoryEntry.
 * Expected format:
 *   TITLE: <title>
 *   SUMMARY: <summary>
 *   CONCLUSIONS: <conclusions>
 */
export function parseDistillResponse(response: string): HotMemoryEntry | null {
  const lines = response.trim().split('\n');
  if (lines.length === 0) return null;

  // Check for the no-op signal
  if (response.trim().toUpperCase().includes('NO_NEW_INSIGHTS')) return null;

  let title = '';
  let summary = '';
  let conclusions: string | undefined;

  for (const line of lines) {
    if (line.startsWith('TITLE: ')) {
      title = line.slice('TITLE: '.length).trim();
    } else if (line.startsWith('SUMMARY: ')) {
      summary = line.slice('SUMMARY: '.length).trim();
    } else if (line.startsWith('CONCLUSIONS: ')) {
      conclusions = line.slice('CONCLUSIONS: '.length).trim();
    }
  }

  if (!title || !summary) return null;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
  return { date: dateStr, title, summary, conclusions };
}

/**
 * Distill the most recent session messages into a hot memory entry.
 */
export async function distillSession(opts: {
  db: { prepare: (sql: string) => { all: (...params: any[]) => any[]; run: (...params: any[]) => any } };
  hotMemoryDir: string;
  llmCall: (prompt: string) => Promise<string>;
}): Promise<void> {
  const { db, hotMemoryDir, llmCall } = opts;

  try {
    const currentContent = readHotMemoryFile(hotMemoryDir);
    const entries = parseHotMemoryFile(currentContent);

    // Find the most recent entry date as lastDistillTimestamp
    let lastDistillTimestamp: string | undefined;
    if (entries.length > 0) {
      lastDistillTimestamp = entries[0].date;
    }

    // Query messages since the last distill timestamp
    let messages: Array<{ role: string; content: string; created_at: string }>;
    try {
      if (lastDistillTimestamp) {
        messages = db.prepare(
          `SELECT role, content, created_at FROM messages WHERE created_at > ? ORDER BY created_at LIMIT 200`
        ).all(lastDistillTimestamp) as any[];
      } else {
        messages = db.prepare(
          `SELECT role, content, created_at FROM messages ORDER BY created_at LIMIT 200`
        ).all() as any[];
      }
    } catch {
      return;
    }

    if (messages.length === 0) return;

    // Build conversation excerpt
    const conversationExcerpt = messages
      .slice(0, 50)
      .map((m) => `[${m.role}] ${m.content.slice(0, 200)}`)
      .join('\n');

    const prompt = `${DISTILL_SYSTEM_PROMPT}\n\nCONVERSATION:\n${conversationExcerpt}`;

    // Call LLM
    let response: string;
    try {
      response = await llmCall(prompt);
    } catch {
      return;
    }

    const entry = parseDistillResponse(response);
    if (!entry) return;

    // Prepend new entry, prune, write back
    const allEntries = [entry, ...entries];
    const pruned = pruneEntries(allEntries);

    const formatted = pruned.map(formatHotMemoryEntry).join('');
    const filePath = join(hotMemoryDir, 'hot-memory.md');
    writeFileSync(filePath, HOT_MEMORY_HEADER + formatted, 'utf-8');
  } catch {
    // Swallow all errors — distillation is best-effort
  }
}

// ─── parseHotMemoryFile ───────────────────────────────────────────────────────

/**
 * Parses the content of hot-memory.md into an array of HotMemoryEntry objects.
 * Returns an empty array for header-only content or empty strings.
 */
export function parseHotMemoryFile(content: string): HotMemoryEntry[] {
  if (!content) return [];

  const entries: HotMemoryEntry[] = [];

  // Split by the start of each entry: "## "
  const blocks = content.split('\n## ');
  // blocks[0] is the header content before the first "## " — skip it

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;

    const lines = block.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;

    // First line: "date — title"
    const firstLine = lines[0];
    const sepIndex = firstLine.indexOf(' — ');
    if (sepIndex === -1) continue;

    const date = firstLine.slice(0, sepIndex).trim();
    const title = firstLine.slice(sepIndex + 3).trim();

    // Remaining lines: Summary: ..., Conclusions: ...
    let summary = '';
    let conclusions: string | undefined;

    for (let j = 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.startsWith('Summary: ')) {
        summary = line.slice('Summary: '.length);
      } else if (line.startsWith('Conclusions: ')) {
        conclusions = line.slice('Conclusions: '.length);
      }
    }

    if (date && title && summary) {
      entries.push({ date, title, summary, conclusions });
    }
  }

  return entries;
}

// Note: the hot-memory EXTENSION wiring (before_agent_start injection +
// session_shutdown distillation) moved into the memory provider — builtin owns
// hot injection via grounding() and session distillation via store(source:
// 'session'). This module now only provides the pure distill/data-model helpers
// used by the provider and by tests.
