/**
 * Budget Manager Extension
 *
 * Provides tools for the agent to self-manage per-task spending constraints
 * and answer owner spend-status queries:
 *
 * - set_budget(amount, unit)    — declare a budget for the current task
 * - check_budget()              — check spend vs budget (structured for agent)
 * - budget_status(period, ...)  — human-readable spend summary for owner queries
 *
 * Also handles turn_end accumulation against the active task budget and
 * injects a wrap-up instruction on turn_start when the budget is exhausted.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskBudget {
  amount: number;
  unit: 'usd' | 'tokens';
  spent: number;       // accumulated cost in USD (for usd budgets)
  exhausted: boolean;
}

interface ExtensionContext {
  workspacePath: string;
  config: any;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function makeBudgetManagerExtension(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const { workspacePath, config } = ctx;
  const taskBudgetPath = join(workspacePath, '.task_budget.json');

  // ── Per-task budget closure ──────────────────────────────────────────────

  let _taskBudget: TaskBudget | null = null;
  let _exhausted = false;

  // ── set_budget tool ──────────────────────────────────────────────────────

  pi.tool(
    'set_budget',
    'Set a spending budget for the current task. Call this when the owner specifies a budget constraint (e.g. "don\'t spend more than $5"). IMPORTANT: After setting the budget, you MUST immediately assess whether it is feasible for the planned task. If it is clearly insufficient (e.g. $0.30 for a multi-source research task), warn the owner before starting and offer to proceed or abort.',
    z.object({
      amount: z.number().positive().describe('Budget amount'),
      unit: z.enum(['usd', 'tokens']).describe('Budget unit: "usd" for dollars, "tokens" for token count'),
    }),
    async ({ amount, unit }: { amount: number; unit: 'usd' | 'tokens' }) => {
      _taskBudget = { amount, unit, spent: 0, exhausted: false };
      _exhausted = false;

      // Write task budget file for persistence / crash recovery reference
      writeFileSync(taskBudgetPath, JSON.stringify({ amount, unit, startCost: 0 }));

      const displayAmount = unit === 'usd'
        ? `$${amount.toFixed(2)}`
        : `${_formatTokens(amount)} tokens`;

      return `Budget set: ${displayAmount} for this task. Before proceeding, assess whether this budget is sufficient and realistic for what you are planning to do. If it is clearly insufficient, warn the owner and offer to proceed or abort.`;
    }
  );

  // ── check_budget tool ────────────────────────────────────────────────────

  pi.tool(
    'check_budget',
    'Check your current spending versus the active task budget and global limits.',
    z.object({}),
    async (_args: {}) => {
      const globalSection = await _buildGlobalSection(config);
      if (!_taskBudget) {
        return `No active task budget.\n${globalSection}`;
      }

      const { amount, unit, spent } = _taskBudget;
      const remaining = Math.max(0, amount - spent);
      const pct = amount > 0 ? Math.round((spent / amount) * 100) : 0;

      let taskLine: string;
      if (unit === 'usd') {
        taskLine = `Task budget: $${spent.toFixed(2)} spent of $${amount.toFixed(2)} (${pct}% used, $${remaining.toFixed(2)} remaining)`;
      } else {
        taskLine = `Task budget: ${_formatTokens(spent)} spent of ${_formatTokens(amount)} tokens (${pct}% used, ${_formatTokens(remaining)} remaining)`;
      }

      return `${taskLine}\n${globalSection}`;
    }
  );

  // ── budget_status tool ───────────────────────────────────────────────────

  pi.tool(
    'budget_status',
    'Get a human-readable summary of spending for the owner. Use this to answer questions like "how much did you spend today?" or "how much did the last memory run cost?".',
    z.object({
      period: z.enum(['today', 'last', 'week']).optional().describe('Time period: "today", "last" (most recent matching), or "week"'),
      operationType: z.enum(['user_message', 'scheduler', 'memory', 'heartbeat', 'recovery']).optional().describe('Filter by operation type'),
    }),
    async ({ period = 'today', operationType }: { period?: string; operationType?: string }) => {
      try {
        const { getDb } = await import('../db/index.js');
        const db = getDb();
        return _buildStatusSummary(db, config, period, operationType);
      } catch {
        return 'Unable to query spend data — database not available.';
      }
    }
  );

  // ── turn_end: accumulate cost against task budget ─────────────────────────

  pi.on('turn_end', async (event: any, _ctx: any) => {
    if (!_taskBudget || _taskBudget.exhausted) return;

    const msg = event.message as any;
    const cost = msg?.usage?.cost?.total ?? 0;

    if (_taskBudget.unit === 'usd') {
      _taskBudget.spent += cost;

      if (_taskBudget.spent >= _taskBudget.amount) {
        _taskBudget.exhausted = true;
        _exhausted = true;

        // Emit audit event
        try {
          const { getDb } = await import('../db/index.js');
          const { emitEvent } = await import('../observability/events.js');
          const db = getDb();
          await emitEvent(db, {
            type: 'budget_exhausted',
            severity: 17,
            payload: {
              spent: _taskBudget.spent,
              budget: _taskBudget.amount,
              unit: _taskBudget.unit,
            },
          });
        } catch { /* non-critical */ }
      }
    }
  });

  // ── before_agent_start: inject wrap-up instruction if budget exhausted ─────
  // pi's correct API: return { systemPrompt } from before_agent_start to
  // prepend content to the system prompt for the next LLM call.

  pi.on('before_agent_start', async (event: any, _ctx: any) => {
    if (!_exhausted || !_taskBudget) return;

    const spent = _taskBudget.spent.toFixed(2);
    const budget = _taskBudget.amount.toFixed(2);

    const instruction = `⚠️ TASK BUDGET EXHAUSTED ($${spent} of $${budget} used). Immediately stop all further tool calls. Deliver whatever you have completed so far as your final response. Do not start new work.`;

    const existingPrompt = event?.systemPrompt ?? '';
    return { systemPrompt: `${existingPrompt}\n\n${instruction}` };
  });

  // ── agent_end: clear task budget ─────────────────────────────────────────

  pi.on('agent_end', async (_event: any, _ctx: any) => {
    _taskBudget = null;
    _exhausted = false;

    // Clean up file
    try {
      if (existsSync(taskBudgetPath)) {
        unlinkSync(taskBudgetPath);
      }
    } catch { /* non-critical */ }
  });
}

// ─── Default export (pi extension API) ───────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Budget manager is always-on; workspace path derived at runtime
  // In production, the loader passes ctx.cwd as workspacePath
  // This default export is for the standard pi extension loader path
  makeBudgetManagerExtension(pi, {
    workspacePath: process.cwd(),
    config: {},
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

async function _buildGlobalSection(config: any): Promise<string> {
  const budget = config?.budget;
  if (!budget) return 'Global limits: none configured';

  const hasDailyCost = budget.daily_cost_usd !== null && budget.daily_cost_usd !== undefined;
  const hasDailyTokens = budget.daily_tokens !== null && budget.daily_tokens !== undefined;

  if (!hasDailyCost && !hasDailyTokens) return 'Global limits: none configured';

  // Query actual today spend from DB to show current vs limit
  let todaySpend = { cost: 0, tokens: 0 };
  try {
    const { getDb } = await import('../db/index.js');
    const db = getDb();
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(cost_usd), 0) as cost,
        COALESCE(SUM(input_tokens + output_tokens), 0) as tokens
      FROM usage
      WHERE created_at >= date('now', 'start of day')
    `).get() as { cost: number; tokens: number };
    todaySpend = row;
  } catch { /* DB not available; show limits only */ }

  const parts: string[] = [];
  if (hasDailyCost) {
    const pct = budget.daily_cost_usd > 0
      ? Math.round((todaySpend.cost / budget.daily_cost_usd) * 100)
      : 0;
    parts.push(`Daily global: $${todaySpend.cost.toFixed(2)} of $${budget.daily_cost_usd.toFixed(2)} (${pct}% used)`);
  }
  if (hasDailyTokens) {
    const pct = budget.daily_tokens > 0
      ? Math.round((todaySpend.tokens / budget.daily_tokens) * 100)
      : 0;
    parts.push(`Daily tokens: ${_formatTokens(todaySpend.tokens)} of ${_formatTokens(budget.daily_tokens)} (${pct}% used)`);
  }

  return parts.join('\n');
}

function _buildStatusSummary(
  db: import('better-sqlite3').Database,
  config: any,
  period: string,
  operationType?: string
): string {
  const budget = config?.budget;

  if (period === 'last' && operationType) {
    // Most recent row matching operation_type
    const row = db.prepare(`
      SELECT cost_usd, input_tokens, output_tokens
      FROM usage
      WHERE operation_type = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(operationType) as { cost_usd: number; input_tokens: number; output_tokens: number } | undefined;

    if (!row) return `No ${operationType} operations found`;

    const allZeroCost = row.cost_usd === 0;
    const tokens = row.input_tokens + row.output_tokens;
    if (allZeroCost) {
      return `Last ${operationType} run: ${_formatTokens(tokens)} tokens (cost unavailable for this model)`;
    }
    return `Last ${operationType} run: $${row.cost_usd.toFixed(2)} (${_formatTokens(tokens)} tokens)`;
  }

  // Today aggregation (default)
  const whereClause = period === 'week'
    ? `created_at >= datetime('now', '-7 days')`
    : `created_at >= date('now', 'start of day')`;

  const opFilter = operationType ? `AND operation_type = '${operationType}'` : '';

  const row = db.prepare(`
    SELECT
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COALESCE(SUM(input_tokens), 0) as total_input,
      COALESCE(SUM(output_tokens), 0) as total_output
    FROM usage
    WHERE ${whereClause} ${opFilter}
  `).get() as { total_cost: number; total_input: number; total_output: number };

  const label = period === 'week' ? 'This week' : 'Today';
  const allZeroCost = row.total_cost === 0 && (row.total_input + row.total_output) > 0;

  let summary: string;
  if (allZeroCost) {
    summary = `${label}: ${_formatTokens(row.total_input)} tokens input / ${_formatTokens(row.total_output)} tokens output (cost unavailable for this model)`;
  } else {
    summary = `${label}: $${row.total_cost.toFixed(2)} spent (${_formatTokens(row.total_input)} tokens input / ${_formatTokens(row.total_output)} tokens output)`;
    if (budget?.daily_cost_usd) {
      const remaining = Math.max(0, budget.daily_cost_usd - row.total_cost);
      const pct = Math.round((row.total_cost / budget.daily_cost_usd) * 100);
      summary += ` — $${remaining.toFixed(2)} of $${budget.daily_cost_usd.toFixed(2)} remaining (${pct}% used)`;
    } else {
      summary += ' — no daily limit set';
    }
  }

  return summary;
}
