import { readFileSync, existsSync } from 'fs';
import type { Database } from 'better-sqlite3';
import type { ChannelAdapter } from '../channels/interface.js';
import type { ResilienceConfig } from '../config.js';
import { getOpenJournals } from './turn-journal.js';
import { broadcastToAllChannels } from '../utils/broadcast.js';
import { computeNextRun } from '../scheduler/parse.js';

// ─── Config shape used here ───────────────────────────────────────────────────

interface ResilienceConfigWrapper {
  resilience: ResilienceConfig;
}

// ─── Duration string parser ───────────────────────────────────────────────────

const UNIT_MS: Record<string, number> = {
  m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
  h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000,
  d: 86_400_000, day: 86_400_000, days: 86_400_000,
};

function parseDurationMs(s: string): number {
  const lower = s.trim().toLowerCase();
  const m = lower.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/);
  if (m) {
    const n = parseFloat(m[1]);
    const ms = UNIT_MS[m[2]];
    if (ms !== undefined && n > 0) return Math.round(n * ms);
  }
  throw new Error(`Cannot parse duration: "${s}"`);
}

// ─── notifyRestart ──────────────────────────────────────────────────────────

/**
 * Detects if reeboot was previously running (via a `reeboot_state` DB marker)
 * and broadcasts a restart notification to all channels.
 *
 * Always updates the `last_started_at` marker so future restarts are detected.
 * On the very first startup (no marker) no notification is sent.
 */
export function notifyRestart(
  db: Database,
  adapters: Map<string, ChannelAdapter>
): void {
  db.exec(`CREATE TABLE IF NOT EXISTS reeboot_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  const prev = db
    .prepare(`SELECT value FROM reeboot_state WHERE key = 'last_started_at'`)
    .get() as { value: string } | undefined;

  // Update / insert the marker for this startup
  db.prepare(
    `INSERT OR REPLACE INTO reeboot_state (key, value) VALUES ('last_started_at', datetime('now'))`
  ).run();

  if (prev) {
    broadcastToAllChannels(
      adapters,
      `\u{1F504} I was restarted. If you were waiting on something, please re-send your request.`
    );
  }
}

// ─── cleanStaleJournals ───────────────────────────────────────────────────────

/**
 * Deletes turn_journal rows older than 24 hours.
 * These are too stale to recover — logged as warnings and discarded.
 */
export function cleanStaleJournals(db: Database): void {
  const stale = db
    .prepare(
      `SELECT turn_id FROM turn_journal
       WHERE status = 'open' AND started_at < datetime('now', '-24 hours')`
    )
    .all() as Array<{ turn_id: string }>;

  for (const row of stale) {
    console.warn(`[resilience] Discarding stale crashed turn: ${row.turn_id}`);
  }

  db.exec(
    `DELETE FROM turn_journal
     WHERE status = 'open' AND started_at < datetime('now', '-24 hours')`
  );
}

// ─── recoverCrashedTurns ──────────────────────────────────────────────────────

/**
 * Scans for unclosed turn_journal entries and applies the configured recovery
 * policy to each one:
 *
 *   safe_only  — auto-resume if no side-effectful tools fired; notify+ask otherwise
 *   always     — auto-resume regardless of what tools fired
 *   never      — always notify the user, never auto-resume
 *
 * Deletes the journal row after handling it (regardless of policy outcome).
 */
export async function recoverCrashedTurns(
  db: Database,
  config: ResilienceConfigWrapper,
  adapters: Map<string, ChannelAdapter>,
  requeueFn: (contextId: string, prompt: string) => void
): Promise<void> {
  cleanStaleJournals(db);

  const openJournals = getOpenJournals(db);
  if (openJournals.length === 0) return;

  const recovery = config.resilience?.recovery ?? { mode: 'safe_only' as const, side_effect_tools: [] };
  const { mode, side_effect_tools } = recovery;
  const sideEffectSet = new Set(side_effect_tools);

  for (const journal of openJournals) {
    const hasSideEffect = journal.steps.some((s) => sideEffectSet.has(s.tool_name));
    const isSafe = !hasSideEffect;
    const prompt = journal.prompt ?? '(unknown)';
    const contextId = journal.context_id;

    let shouldRequeue = false;

    if (mode === 'always') {
      shouldRequeue = true;
    } else if (mode === 'safe_only') {
      shouldRequeue = isSafe;
    } else {
      // 'never'
      shouldRequeue = false;
    }

    if (shouldRequeue) {
      const notice =
        `⚠️ I was restarted and detected an interrupted request in context "${contextId}". ` +
        `I'm re-running it now: "${prompt}"`;
      broadcastToAllChannels(adapters, notice);
      requeueFn(contextId, prompt);
    } else {
      const sideEffectNames = journal.steps
        .filter((s) => sideEffectSet.has(s.tool_name))
        .map((s) => s.tool_name)
        .filter((name, idx, arr) => arr.indexOf(name) === idx); // deduplicate
      const notice = isSafe
        ? `⚠️ I was restarted. A previous request in context "${contextId}" was interrupted: ` +
          `"${prompt}". Please re-send your request if needed.`
        : `⚠️ I was restarted. A previous request in context "${contextId}" was interrupted ` +
          `after side-effectful tool(s) had already run (${sideEffectNames.join(', ')}): "${prompt}". ` +
          `Please check whether the action completed and re-send if needed.`;
      broadcastToAllChannels(adapters, notice);
    }

    // Remove the journal row — it has been handled
    db.prepare('DELETE FROM turn_journal WHERE turn_id = ?').run(journal.turn_id);
  }
}

// ─── applyScheduledCatchup ────────────────────────────────────────────────────

interface TaskRow {
  id: string;
  schedule_type: string;
  schedule_value: string;
  normalized_ms: number | null;
  next_run: string | null;
  catchup: string | null;
}

/**
 * On startup, fires any scheduled tasks whose `next_run` was missed within
 * the configured catchup window. Tasks missed beyond the window have their
 * `next_run` advanced to the next natural occurrence instead.
 *
 * Per-task `catchup` column overrides the global `catchup_window`:
 *   NULL        → use global window (e.g. '1h')
 *   'always'    → always fire regardless of age
 *   'never'     → never catch up — advance to next natural run
 *   '<duration>' → custom window (e.g. '2h', '30m')
 */
export function applyScheduledCatchup(
  db: Database,
  config: ResilienceConfigWrapper
): void {
  const now = Date.now();
  const globalWindow = config.resilience?.scheduler?.catchup_window ?? '1h';
  const globalWindowMs = parseDurationMs(globalWindow);

  // Guard: tasks table may not have scheduler columns yet in minimal DBs
  const tasksExists = (db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'`
  ).get() as { name: string } | undefined);
  if (!tasksExists) return;

  const taskCols = new Set(
    (db.pragma('table_info(tasks)') as Array<{ name: string }>).map(c => c.name)
  );
  if (!taskCols.has('schedule_type') || !taskCols.has('next_run')) return;

  const overdue = db
    .prepare(`SELECT id, schedule_type, schedule_value, normalized_ms, next_run, catchup
              FROM tasks WHERE status = 'active' AND datetime(next_run) < datetime('now')`)
    .all() as TaskRow[];

  const updateNextRun = db.prepare('UPDATE tasks SET next_run = ? WHERE id = ?');

  for (const task of overdue) {
    const missedMs = task.next_run ? now - new Date(task.next_run).getTime() : 0;
    const catchupPol = task.catchup ?? null;

    let shouldFire: boolean;
    if (catchupPol === 'always') {
      shouldFire = true;
    } else if (catchupPol === 'never') {
      shouldFire = false;
    } else {
      const windowMs = catchupPol ? parseDurationMs(catchupPol) : globalWindowMs;
      shouldFire = missedMs <= windowMs;
    }

    if (shouldFire) {
      // Mark as due-now so the scheduler picks it up immediately
      updateNextRun.run(new Date(now).toISOString(), task.id);
    } else {
      // Advance to next natural occurrence
      const nextNatural = computeNextRun({
        schedule_type: task.schedule_type,
        schedule_value: task.schedule_value,
        normalized_ms: task.normalized_ms,
        next_run: null, // force recompute from now
      });
      if (nextNatural) {
        updateNextRun.run(nextNatural, task.id);
      }
    }
  }
}

// ─── scanSessionForUnansweredMessage ─────────────────────────────────────────

/**
 * Reads a pi session JSONL file and checks whether the last message entry is
 * from the user with no subsequent assistant response.
 *
 * Returns the user message text if the session appears to have an unanswered
 * request, or `null` if the last message was from the assistant, the file does
 * not exist, or there are no message entries.
 */
export function scanSessionForUnansweredMessage(sessionPath: string): string | null {
  if (!existsSync(sessionPath)) return null;

  let raw: string;
  try {
    raw = readFileSync(sessionPath, 'utf8');
  } catch {
    return null;
  }

  const lines = raw.split('\n').filter(l => l.trim().length > 0);

  // Walk lines in reverse to find the last message entry
  let lastMessageRole: string | null = null;
  let lastMessageText: string | null = null;

  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: any;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }

    if (entry?.type !== 'message') continue;

    const msg = entry.message;
    if (!msg || typeof msg.role !== 'string') continue;

    lastMessageRole = msg.role;

    if (msg.role === 'user' && Array.isArray(msg.content)) {
      // Concatenate all text blocks
      lastMessageText = msg.content
        .filter((c: any) => c?.type === 'text')
        .map((c: any) => c.text as string)
        .join('');
    }
    break;
  }

  return lastMessageRole === 'user' ? lastMessageText : null;
}
