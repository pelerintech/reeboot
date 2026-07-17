/**
 * BudgetGuard — pre-dispatch global limit check
 *
 * Called by the orchestrator before each runner.prompt() to enforce
 * per-turn, per-session, and per-day token/cost limits.
 */

import type { Database } from 'better-sqlite3';

export interface BudgetCheckResult {
  ok: boolean;
  reason?: string;
  warning?: string;
}

// ─── BudgetGuard ─────────────────────────────────────────────────────────────

export class BudgetGuard {
  /** Track which thresholds have already triggered a warning to avoid spam */
  private _warnedKeys = new Set<string>();

  /** Session start timestamp (SQLite UTC format) */
  private readonly _sessionStartTs: string;

  constructor(sessionStartTs?: string) {
    // Default to 'now' in SQLite UTC format if not provided
    this._sessionStartTs = sessionStartTs ?? new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  /**
   * Check global budget limits before dispatching a turn.
   * Returns { ok: true } if no limits are configured or nothing is breached.
   * Returns { ok: false, reason } when a hard limit is breached.
   * Returns { ok: true, warning } when approaching the warn threshold.
   */
  check(db: Database, contextId: string, config: any): BudgetCheckResult {
    const budget = config?.budget;
    if (!budget) return { ok: true };

    const {
      daily_tokens,
      daily_cost_usd,
      session_tokens,
      session_cost_usd,
      turn_tokens,
      turn_cost_usd,
      warn_threshold = 0.8,
    } = budget;

    // Short-circuit: if all limits are null, no enforcement
    const hasAnyLimit = [
      daily_tokens, daily_cost_usd,
      session_tokens, session_cost_usd,
      turn_tokens, turn_cost_usd,
    ].some(v => v !== null && v !== undefined);

    if (!hasAnyLimit) return { ok: true };

    // Collect the first warning (preserving _warnedKeys dedup)
    let pendingWarning: string | undefined;

    const maybeWarn = (warnKey: string, warning: string) => {
      if (!pendingWarning && !this._warnedKeys.has(warnKey)) {
        this._warnedKeys.add(warnKey);
        pendingWarning = warning;
      }
    };

    // ── Daily checks ──────────────────────────────────────────────────────────

    if (daily_tokens !== null && daily_tokens !== undefined) {
      const row = db.prepare(`
        SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total
        FROM usage
        WHERE context_id = ? AND created_at >= date('now', 'start of day')
      `).get(contextId) as { total: number };

      const used = row.total;
      if (used > daily_tokens) {
        return { ok: false, reason: `Daily token limit reached (${used} / ${daily_tokens})` };
      }

      const pct = used / daily_tokens;
      if (pct >= warn_threshold) {
        maybeWarn(
          `daily_tokens:${Math.floor(pct * 100)}`,
          `Daily token usage at ${Math.round(pct * 100)}% (${used} / ${daily_tokens})`,
        );
      }
    }

    if (daily_cost_usd !== null && daily_cost_usd !== undefined) {
      const row = db.prepare(`
        SELECT COALESCE(SUM(cost_usd), 0) as total
        FROM usage
        WHERE context_id = ? AND created_at >= date('now', 'start of day')
      `).get(contextId) as { total: number };

      const used = row.total;
      if (used > daily_cost_usd) {
        return {
          ok: false,
          reason: `Daily cost limit reached ($${used.toFixed(2)} / $${daily_cost_usd.toFixed(2)})`,
        };
      }

      const pct = used / daily_cost_usd;
      if (pct >= warn_threshold) {
        maybeWarn(
          `daily_cost:${Math.floor(pct * 100)}`,
          `Daily cost usage at ${Math.round(pct * 100)}% ($${used.toFixed(2)} / $${daily_cost_usd.toFixed(2)})`,
        );
      }
    }

    // ── Session checks ────────────────────────────────────────────────────────
    // Session = rows created since the session start (process-lifetime), scoped by
    // `created_at >= _sessionStartTs` (not start-of-day).

    if (session_tokens !== null && session_tokens !== undefined) {
      const row = db.prepare(`
        SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total
        FROM usage
        WHERE context_id = ?
          AND created_at >= ?
      `).get(contextId, this._sessionStartTs) as { total: number };

      const used = row.total;
      if (used > session_tokens) {
        return { ok: false, reason: `Session token limit reached (${used} / ${session_tokens})` };
      }
    }

    if (session_cost_usd !== null && session_cost_usd !== undefined) {
      const row = db.prepare(`
        SELECT COALESCE(SUM(cost_usd), 0) as total
        FROM usage
        WHERE context_id = ?
          AND created_at >= ?
      `).get(contextId, this._sessionStartTs) as { total: number };

      const used = row.total;
      if (used > session_cost_usd) {
        return {
          ok: false,
          reason: `Session cost limit reached ($${used.toFixed(2)} / $${session_cost_usd.toFixed(2)})`,
        };
      }
    }

    // ── Turn checks (last turn's actual cost) ─────────────────────────────────

    if (turn_tokens !== null && turn_tokens !== undefined) {
      const row = db.prepare(`
        SELECT COALESCE(input_tokens + output_tokens, 0) as total
        FROM usage
        WHERE context_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(contextId) as { total: number } | undefined;

      if (row && row.total > turn_tokens) {
        return {
          ok: false,
          reason: `Last turn exceeded per-turn token limit (${row.total} / ${turn_tokens})`,
        };
      }
    }

    if (turn_cost_usd !== null && turn_cost_usd !== undefined) {
      const row = db.prepare(`
        SELECT COALESCE(cost_usd, 0) as cost
        FROM usage
        WHERE context_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).get(contextId) as { cost: number } | undefined;

      if (row && row.cost > turn_cost_usd) {
        return {
          ok: false,
          reason: `Last turn exceeded per-turn cost limit ($${row.cost.toFixed(2)} / $${turn_cost_usd.toFixed(2)})`,
        };
      }
    }

    // All hard limits passed. Return pending warning if any.
    return pendingWarning ? { ok: true, warning: pendingWarning } : { ok: true };
  }
}
