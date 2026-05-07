# Design: Token Budget & Overspend Protection

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│  config.json → budget section                                           │
│    daily_tokens / daily_cost_usd                                        │
│    session_tokens / session_cost_usd                                    │
│    turn_tokens / turn_cost_usd                                          │
│    warn_threshold: 0.8                                                  │
│                  │                                                       │
│  Orchestrator ───┤                                                       │
│    pre-dispatch: BudgetGuard.check(db, contextId, config)               │
│      → queries usage table → BLOCK if breached, WARN if approaching     │
│      → writes .reeboot_turn_meta.json to workspace (operation_type)     │
│                  │                                                       │
│    runner.prompt(...)                                                    │
│                  │                                                       │
│  Pi extension (budget-manager.ts)                                        │
│    turn_end → accumulate cost for per-task budget                       │
│    agent_end → (token-meter already fires here)                          │
│    set_budget() tool → writes budget to .task_budget.json               │
│    check_budget() tool → returns accumulated cost vs limits             │
│    budget_status() tool → queries usage table, human-readable summary   │
│                  │                                                       │
│  token-meter.ts (updated)                                               │
│    agent_end → reads cost + operation_type → persists to usage table    │
│                  │                                                       │
│  usage table: cost_usd, operation_type columns added                    │
│                  │                                                       │
│  observability-system events stream ← budget warning / breach events   │
│                                                                         │
│  Settings tab (webchat) ← GET/POST /api/settings/budget                │
└─────────────────────────────────────────────────────────────────────────┘
```

## Decision: Config Schema — budget section

New top-level `budget` key in `config.json` / `ConfigSchema`:

```json
{
  "budget": {
    "daily_tokens": null,
    "daily_cost_usd": null,
    "session_tokens": null,
    "session_cost_usd": null,
    "turn_tokens": null,
    "turn_cost_usd": null,
    "warn_threshold": 0.8
  }
}
```

All limit fields default to `null` (absent = no enforcement). Existing installs see zero
behaviour change. Limits can be expressed in tokens OR cost — both checked independently
if set. Token check is always authoritative for blocking; cost is the display unit.

## Decision: BudgetGuard — pre-dispatch check in orchestrator

A new `src/budget/guard.ts` module exposes `BudgetGuard.check(db, contextId, config)`.
Called by the orchestrator immediately before `runner.prompt()`, after the journal is
opened but before the turn starts. Returns `{ ok: boolean, reason?: string, warning?: string }`.

- **Turn limit**: not enforceable pre-dispatch (we don't know turn cost yet). Checked
  post-turn via token-meter data. If last turn exceeded the limit, the NEXT dispatch is
  blocked with a warning.
- **Session limit**: sum `usage` WHERE `context_id = ? AND created_at >= session_start`.
  `session_start` = most recent pi session file timestamp or server start time.
- **Daily limit**: sum `usage` WHERE `created_at >= datetime('now', 'start of day')`.

If `ok = false` → orchestrator calls `_reply(msg, reason)` and returns without dispatching.
If `warning` → orchestrator emits a budget warning event and broadcasts to the owner, but
still dispatches the turn.

## Decision: operation_type via workspace meta file

The orchestrator knows `channelType` (user_message, scheduler, memory, heartbeat, recovery).
The token-meter extension knows only `ctx.cwd`. Bridge: the orchestrator writes a tiny JSON
file to the context workspace before each turn:

```
~/.reeboot/contexts/<contextId>/workspace/.reeboot_turn_meta.json
{ "operationType": "scheduler", "turnId": "..." }
```

`token-meter.ts` reads this file during `agent_end` alongside the cost data. If absent,
defaults to `"user_message"`. This avoids any cross-boundary communication complexity and
follows the existing pattern (`ctx.cwd` → `contextId`).

## Decision: Per-task budget lives in the extension, not the orchestrator

Per-task budgets are set and tracked entirely inside the pi extension context:

1. `set_budget(amount, unit)` tool: stores budget in the extension's closure + writes to
   `~/.reeboot/contexts/<contextId>/workspace/.task_budget.json`
2. `turn_end` hook: reads `event.message.usage.cost.total`, accumulates in the closure
3. When accumulated cost ≥ budget: on next `turn_start`, injects a system instruction:
   *"BUDGET EXHAUSTED ($X of $Y spent). Stop all work. Deliver whatever you have completed.
   Do not make any more tool calls."* This triggers the agent's natural wrap-up behaviour.
4. `check_budget()` tool: returns `{ spent, budget, remaining, percentUsed }` from the
   closure for the agent to reason about mid-task.

The "hard backstop" for per-task is this injection on the next `turn_start`. It's soft
enforcement aligned with the agentic self-management philosophy — the agent is instructed,
not forcibly killed. Global limits (Layer 1) remain the true hard stop.

## Decision: budget_status() — separate from check_budget()

Two distinct tools with different audiences:

- `check_budget()` — for the agent, returns structured data about the active per-task
  budget (spending within the current session task). Returns null if no per-task budget
  is active.
- `budget_status()` — for the owner, returns a human-readable summary answering questions
  like "how much did you spend today?" or "how much on the last memory run?". Queries the
  `usage` table with filters by date, operation_type, or context.

## Decision: Settings tab REST endpoint

New endpoint: `GET/PUT /api/settings/budget` in the Hono server.
- `GET` returns the current budget config from the loaded config object.
- `PUT` accepts partial budget config, merges into `config.json`, saves, and reloads the
  budget guard (no full server restart needed for limit changes).

The Settings tab is a minimal HTML form — one input per limit field, a save button. No
framework. Will be rebuilt with reeboot-web. Same tab nav structure as the Logs tab added
by observability-system.

## Decision: Cost units — USD with token fallback

All user-facing budget display uses USD (e.g. "$2.84 of $5.00 daily budget used"). Token
counts are shown in parentheses for transparency ("(142k / 500k tokens)"). For providers
without pricing in pi's registry (some local models return 0 cost), the display falls back
to tokens only and notes "cost unavailable for this model".

## Decision: No custom pricing table

Pi's `ModelRegistry` already contains `cost: { input, output, cacheRead, cacheWrite }`
per token for all major providers. `AssistantMessage.usage.cost.total` is the authoritative
cost figure — already calculated by pi, persisted by the updated token-meter. No additional
pricing infrastructure needed.

## Risk: turn_end fires per-LLM-call, not per-orchestrator-turn

Within a single orchestrator turn, the agent may make many LLM calls (one per tool-use
round-trip). The `turn_end` hook fires after each one. Cost accumulation in the extension
closure is therefore incremental and accurate — it correctly models the agent spending
budget across multiple internal turns within a single user message.

## Risk: session_start timestamp ambiguity

"Session" in reeboot = a pi session file. Sessions resume across restarts. Defining
`session_start` as the most recent `created_at` in `usage` for this `context_id` (or
server start time if no prior usage) is a pragmatic approximation — the exact boundary
matters less than having a reasonable limit.
