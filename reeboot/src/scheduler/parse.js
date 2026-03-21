/**
 * Schedule parser
 *
 * Parses human-friendly schedule strings into typed schedule descriptors.
 * Supports: ISO 8601 datetimes (once), human interval aliases + "every N unit"
 * (interval), and cron expressions (cron).
 */
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const { parseExpression } = _require('cron-parser');
// ─── Constants ────────────────────────────────────────────────────────────────
const UNIT_MS = {
    s: 1_000,
    sec: 1_000,
    secs: 1_000,
    second: 1_000,
    seconds: 1_000,
    m: 60_000,
    min: 60_000,
    mins: 60_000,
    minute: 60_000,
    minutes: 60_000,
    h: 3_600_000,
    hr: 3_600_000,
    hrs: 3_600_000,
    hour: 3_600_000,
    hours: 3_600_000,
    d: 86_400_000,
    day: 86_400_000,
    days: 86_400_000,
    w: 7 * 86_400_000,
    week: 7 * 86_400_000,
    weeks: 7 * 86_400_000,
};
const ALIASES = {
    hourly: 3_600_000,
    daily: 86_400_000,
    weekly: 7 * 86_400_000,
};
// ─── parseHumanInterval ───────────────────────────────────────────────────────
/**
 * Parses a human-friendly interval string into milliseconds.
 * Returns null if the string is not a recognized interval.
 *
 * Supports:
 * - Aliases: "hourly", "daily", "weekly"
 * - "every N unit": "every 30m", "every 2h", "every 1d", "every 5 minutes"
 */
export function parseHumanInterval(s) {
    const lower = s.trim().toLowerCase();
    // Aliases
    if (ALIASES[lower] !== undefined) {
        return ALIASES[lower];
    }
    // "every N unit"
    const everyMatch = lower.match(/^every\s+(\d+(?:\.\d+)?)\s*([a-z]+)$/);
    if (everyMatch) {
        const n = parseFloat(everyMatch[1]);
        const unit = everyMatch[2];
        const ms = UNIT_MS[unit];
        if (ms !== undefined && n > 0) {
            return Math.round(n * ms);
        }
    }
    return null;
}
// ─── detectScheduleType ───────────────────────────────────────────────────────
/**
 * Detects schedule type from a string value.
 * - ISO 8601 datetime → once
 * - Alias / "every N unit" → interval (with normalizedMs)
 * - Anything else → cron (validated via cron-parser; throws on invalid)
 */
export function detectScheduleType(value) {
    const trimmed = value.trim();
    // ISO 8601 datetime (starts with YYYY-)
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
        return { type: 'once' };
    }
    // Human interval
    const ms = parseHumanInterval(trimmed);
    if (ms !== null) {
        return { type: 'interval', normalizedMs: ms };
    }
    // Try cron — throws if invalid
    try {
        parseExpression(trimmed);
        return { type: 'cron' };
    }
    catch {
        throw new Error(`invalid schedule: "${trimmed}" is not a valid cron expression, ISO datetime, or interval`);
    }
}
// ─── computeNextRun ───────────────────────────────────────────────────────────
/**
 * Computes the next run time for a task.
 * - once: returns null
 * - cron: returns next occurrence after now via cron-parser
 * - interval: advances stored next_run by normalizedMs, skipping past times (drift-free)
 */
export function computeNextRun(task) {
    if (task.schedule_type === 'once') {
        return null;
    }
    if (task.schedule_type === 'cron') {
        return parseExpression(task.schedule_value).next().toDate().toISOString();
    }
    // interval — drift-free advancement
    const ms = task.normalized_ms;
    const now = Date.now();
    let next = task.next_run
        ? new Date(task.next_run).getTime() + ms
        : now + ms;
    while (next <= now) {
        next += ms;
    }
    return new Date(next).toISOString();
}
