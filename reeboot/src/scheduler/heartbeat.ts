/**
 * System Heartbeat
 *
 * Runs at the server level (not per-session). Fires at a configurable interval,
 * renders a live prompt with the current task snapshot, and publishes it to the
 * MessageBus as channelType 'heartbeat'. The orchestrator handles serialisation,
 * inactivity-timer reset, and IDLE suppression — just like any other channel.
 */

import type Database from 'better-sqlite3';
import type { HeartbeatConfig } from '../config.js';
import type { MessageBus } from '../channels/interface.js';
import { createIncomingMessage } from '../channels/interface.js';
import { parseHumanInterval } from './parse.js';
import { getTasksDue, formatTasksDue } from '../scheduler.js';

// ─── renderHeartbeatPrompt ────────────────────────────────────────────────────

/**
 * Renders a fresh heartbeat prompt with:
 * - Current timestamp
 * - Overdue tasks
 * - Upcoming tasks (next 24h)
 * - IDLE instruction
 */
export function renderHeartbeatPrompt(db: Database.Database): string {
  const now = new Date().toISOString();
  const in24h = new Date(Date.now() + 86_400_000).toISOString();

  const due = getTasksDue(db, now);
  const upcoming = db
    .prepare(
      "SELECT * FROM tasks WHERE status='active' AND next_run > ? AND next_run <= ?"
    )
    .all(now, in24h) as Array<{ id: string; prompt: string; next_run: string }>;

  const lines = [
    `System heartbeat — ${new Date().toLocaleString()}`,
    '',
    due.length > 0
      ? `Overdue tasks (${due.length}):\n${formatTasksDue(due)}`
      : 'No overdue tasks.',
    '',
    upcoming.length > 0
      ? `Upcoming tasks (next 24h, ${upcoming.length}):\n${upcoming
          .map((t) => `  [${t.id}] ${t.prompt.slice(0, 60)} — due ${t.next_run}`)
          .join('\n')}`
      : 'No upcoming tasks in next 24h.',
    '',
    'If nothing needs your attention, respond with a single word: IDLE',
  ];

  return lines.join('\n');
}

// ─── Singleton timer ──────────────────────────────────────────────────────────

let _heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

// ─── startHeartbeat ───────────────────────────────────────────────────────────

export function startHeartbeat(
  config: HeartbeatConfig,
  db: Database.Database,
  bus: MessageBus
): void {
  if (!config.enabled) return;

  const intervalMs = parseHumanInterval(config.interval) ?? 300_000; // default 5 min

  const tick = () => {
    try {
      const prompt = renderHeartbeatPrompt(db);
      bus.publish(
        createIncomingMessage({
          channelType: 'heartbeat',
          peerId: config.contextId,
          content: prompt,
          raw: null,
        })
      );
    } catch (err) {
      console.warn(`[Heartbeat] tick failed: ${err}`);
    }
    _heartbeatTimer = setTimeout(tick, intervalMs);
  };

  _heartbeatTimer = setTimeout(tick, intervalMs);
}

// ─── stopHeartbeat ────────────────────────────────────────────────────────────

export function stopHeartbeat(): void {
  if (_heartbeatTimer) {
    clearTimeout(_heartbeatTimer);
    _heartbeatTimer = null;
  }
}
