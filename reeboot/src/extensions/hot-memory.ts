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
import { homedir } from 'os';
import { isReebootHotMemoryEnabled } from './memory-hot-routing.js';

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

// ─── Extension wiring ─────────────────────────────────────────────────────────

/**
 * Creates and registers the hot-memory extension hooks.
 *
 * Registers:
 *   - session_shutdown (reason: 'new') → distills session into hot memory
 *   - before_agent_start → injects hot memory block into system prompt
 */
export function makeHotMemoryExtension(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pi: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any = {}
): void {
  const memoriesDir = join(homedir(), '.reeboot', 'memories');

  // Ensure hot memory file exists
  initHotMemoryFile(memoriesDir);

  // ── before_agent_start — inject hot memory block ───────────────────────
  pi.on('before_agent_start', async (event: any) => {
    if (!isReebootHotMemoryEnabled()) return undefined;
    const content = readHotMemoryFile(memoriesDir);
    const block = buildHotMemoryBlock(content);
    if (!block) return undefined;
    return { systemPrompt: (event.systemPrompt ?? '') + '\n' + block };
  });

  // ── session_shutdown — distill session into hot memory ────────────────
  pi.on('session_shutdown', async (event: any) => {
    if (event.reason !== 'new') return;
    if (!isReebootHotMemoryEnabled()) return;

    try {
      const { getDb } = await import('../db/index.js');
      const db = getDb();
      if (!db) return;

      // Build the production LLM call using the agent's configured model
      const modelConfig = config?.agent?.model ?? {};
      const provider: string = modelConfig.provider ?? '';
      const modelId: string = modelConfig.id ?? '';

      if (!provider || !modelId) {
        // No model configured — can't distill
        return;
      }

      const llmCall = await makeLLMCall(provider, modelId, config);

      await distillSession({
        db,
        hotMemoryDir: memoriesDir,
        llmCall,
      });
    } catch {
      // Swallow — best effort
    }
  });
}

/**
 * Creates an LLM call function that uses the agent's configured model.
 * Resolves the API key from env vars and makes a direct HTTP request.
 */
async function makeLLMCall(
  provider: string,
  modelId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any
): Promise<(prompt: string) => Promise<string>> {
  // Resolve API key from the same env vars the runner uses
  const { resolveProviderEnvKey } = await import('../agent-runner/pi-runner.js');
  const apiKey = resolveProviderEnvKey(provider) || config?.agent?.model?.apiKey || '';

  if (!apiKey) {
    // No API key available — return a no-op
    return async () => 'NO_NEW_INSIGHTS';
  }

  // Build the provider endpoint and request format
  const endpoint = getProviderEndpoint(provider);
  if (!endpoint) {
    return async () => 'NO_NEW_INSIGHTS';
  }

  return async (prompt: string) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'user', content: prompt },
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM call failed: ${response.status}`);
    }

    const data = await response.json() as any;
    // Extract text from various provider response formats
    const text =
      data?.choices?.[0]?.message?.content ??
      data?.content?.[0]?.text ??
      data?.completion ??
      JSON.stringify(data);
    return String(text);
  };
}

/**
 * Returns the chat completions endpoint URL for a given provider.
 * Returns null for unsupported providers.
 */
function getProviderEndpoint(provider: string): string | null {
  const endpoints: Record<string, string> = {
    anthropic: 'https://api.anthropic.com/v1/messages',
    openai: 'https://api.openai.com/v1/chat/completions',
    google: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    mistral: 'https://api.mistral.ai/v1/chat/completions',
  };
  return endpoints[provider.toLowerCase()] ?? null;
}

// ─── Extension default export ─────────────────────────────────────────────────

export default function hotMemoryExtension(api: any, config?: any): void {
  makeHotMemoryExtension(api, config ?? {});
}
