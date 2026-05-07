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
        const warnKey = `daily_tokens:${Math.floor(pct * 100)}`;
        if (!this._warnedKeys.has(warnKey)) {
          this._warnedKeys.add(warnKey);
          return { ok: true, warning: `Daily token usage at ${Math.round(pct * 100)}% (${used} / ${daily_tokens})` };
        }
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
        const warnKey = `daily_cost:${Math.floor(pct * 100)}`;
        if (!this._warnedKeys.has(warnKey)) {
          this._warnedKeys.add(warnKey);
          return {
            ok: true,
            warning: `Daily cost usage at ${Math.round(pct * 100)}% ($${used.toFixed(2)} / $${daily_cost_usd.toFixed(2)})`,
          };
        }
      }
    }

    // ── Session checks ────────────────────────────────────────────────────────
    // Session = rows created since server start (approximate: all rows today for simplicity,
    // or the most pragmatic definition: all rows for this contextId since last context reset)
    // We use a simple definition: all rows for this contextId within the current process
    // lifetime. For now, we approximate as all rows created since the server started.
    // Since we can't easily pass session_start, we use today as an approximation.

    if (session_tokens !== null && session_tokens !== undefined) {
      const row = db.prepare(`
        SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as total
        FROM usage
        WHERE context_id = ?
          AND created_at >= date('now', 'start of day')
      `).get(contextId) as { total: number };

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
          AND created_at >= date('now', 'start of day')
      `).get(contextId) as { total: number };

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

    return { ok: true };
  }
}
