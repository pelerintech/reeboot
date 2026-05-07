# Brief: Token Budget & Overspend Protection

## Problem

Reeboot has no spending guardrails. The `usage` table tracks tokens per turn but ignores
the cost data that pi already calculates. `token-meter.ts` reads `inputTokens` and
`outputTokens` from `agent_end` but discards `usage.cost.total` — the dollar figure pi
computes from its built-in model pricing table. Nothing reads the `usage` table to enforce
limits, warn the owner, or answer spend questions from any channel.

An agent running continuously (heartbeat, scheduled tasks, memory consolidation, long
autonomous sessions) can silently exhaust a daily budget with no signal to the owner until
the bill lands — and users on WhatsApp or Signal have no way to query spend status at all.

## What We Need

### Layer 1 — Global limits (priority)

The owner declares limits in `config.json`:
- Per-turn token cap — hard stop if a single turn would exceed the limit
- Per-session token cap — warn + optionally halt when a session exceeds the limit
- Per-day token cap — warn + halt when daily spend breaches the threshold

Warn threshold is configurable (default 80%). When approaching, a structured audit event
is emitted and the owner is notified via configured channels. When breached, the turn is
blocked and the agent reports why.

Configurable both in `config.json` and in a new **Settings tab** in the webchat. The
Settings tab is intentionally minimal — reeboot-web will replace it when built.

### Layer 2 — Per-task agentic budget

The owner passes a budget constraint in conversation or via an explicit tool:
- *"Research X, don't spend more than $5"* — agent extracts the budget from the message
- `set_budget(amount, unit)` — explicit tool call to declare a budget for this task

When a budget is set:
1. **Feasibility check** — agent briefly reasons about whether the budget is realistic for
   the task. If clearly insufficient (e.g. $0.30 for a multi-source research task), it
   warns the owner before starting and offers to proceed or abort.
2. **Self-management** — agent uses `check_budget()` mid-task to monitor spend and adjust
   planning (fewer sources, shallower search) as budget is consumed.
3. **Hard backstop** — the `turn_end` pi extension hook accumulates cost after each LLM
   call within the session. If the per-task cap is breached, the runner is aborted.
4. **Partial delivery** — on budget exhaustion, the agent delivers whatever it completed
   with an explanation. Full delivery is always the goal; partial is the fallback.

Per-task budgets are session-scoped. If the session crashes and resilience replays the
turn, the budget resets (global limits via the `usage` table still apply).

### Operation type tracking

The `usage` table gains an `operation_type` column so spend is queryable by category:
`user_message`, `scheduler`, `memory`, `heartbeat`, `recovery`. `token-meter.ts` is
updated to record the operation type on every `agent_end` event.

This enables spend queries like "how much did the last memory run cost?" without scanning
unrelated rows.

### Channel-accessible introspection

A `budget_status()` tool lets the agent answer spend questions from any channel (WhatsApp,
Signal, Web):
- *"How much of your daily budget is left?"* → daily limit minus today's total spend
- *"How much did you spend on the last memory run?"* → usage WHERE operation_type = 'memory'
- *"How much did that task cost?"* → spend for the last scheduler run

The tool queries the `usage` table and returns a human-readable summary with both token
counts and estimated cost in the configured currency.

### Token-meter fix

`token-meter.ts` currently ignores `assistantMsg.usage.cost.total` — the dollar cost pi
already calculates from its built-in model pricing. Updated to also persist cost alongside
tokens. No custom pricing table needed — pi's `ModelRegistry` already prices every model
(Anthropic, OpenAI, Google, Groq, etc.) with input/output/cacheRead/cacheWrite cost per
token.

## Relationship to Other Requests

- **Depends on**: `observability-system` — budget breach and warning events flow through
  the audit event stream; the `turn_end` hook pattern and SSE dashboard are established
  there. The Settings tab is a new tab alongside the Logs tab added by that request.
- **Rate limit headroom** (transient API rate limits) is handled in `observability-system`.
  This request handles spend budget (cumulative cost limits).
- **Roadmap**: "Token budget & overspend protection" (Core Agent section).

## Non-Goals

- Custom pricing table — pi already has this
- Per-peer or per-context budget isolation (future request if needed)
- Historical cost analytics or spend trend visualisation (future reeboot-web)
- Budget templates per operation type configured in config (future, extend if needed)

## Acceptance Criteria

1. Owner can configure per-turn, per-session, and per-day limits in `config.json` and via
   the Settings tab. Absent limits = no enforcement (safe default, zero behaviour change).
2. Pre-turn check fires before every runner dispatch. Breached hard limit = turn blocked
   with a clear audit event and a message to the owner via configured channels.
3. Approaching threshold (configurable %, default 80%) = warning event + owner notification.
4. `set_budget()` tool registers a per-task budget for the current session.
5. `check_budget()` tool returns current spend vs budget (global and per-task if active).
6. `budget_status()` tool answers free-form spend queries from any channel.
7. `turn_end` hook accumulates cost mid-session; runner is aborted if per-task cap breached.
8. On per-task budget exhaustion, agent delivers partial result with explanation.
9. `usage` table has `operation_type` column; `token-meter.ts` persists cost and type.
10. Settings tab in webchat shows global limits and current spend with visual indicator.
11. All budget events (warning, breach, throttle) appear in the observability audit stream.
