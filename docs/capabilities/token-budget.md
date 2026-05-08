---
title: "Token Budget"
description: "Per-context daily, session, and turn limits for token usage and LLM cost."
---

# Token Budget

Reeboot tracks token usage and LLM cost for every agent turn, and can enforce limits at three granularities: daily, per-session, and per-turn. All limits are **per-context** — each context has its own independent budget bucket.

---

## Budget Layers

| Layer | Resets | Config fields |
|---|---|---|
| **Daily** | Each calendar day, per context | `budget.daily_tokens`, `budget.daily_cost_usd` |
| **Session** | Each new conversation session | `budget.session_tokens`, `budget.session_cost_usd` |
| **Turn** | Each individual agent turn | `budget.turn_tokens`, `budget.turn_cost_usd` |

Set `null` (the default) to disable a limit.

---

## Configuration

```json
{
  "budget": {
    "daily_cost_usd": 2.00,
    "session_tokens": 100000,
    "turn_tokens": 20000,
    "warn_threshold": 0.8
  }
}
```

When `warn_threshold` is reached (default 0.8 = 80% of limit), the agent is notified. At the limit, the turn is blocked and the agent is instructed to wrap up.

---

## Cost Tracking

Cost is calculated using pi's built-in ModelRegistry, which includes per-token pricing for Anthropic, OpenAI, Google, Groq, and other major providers.

For **local models (Ollama)** and providers without pricing data, cost is shown as "cost unavailable" — not $0.00 — to avoid misleading reporting.

---

## Agent Tools

### `check_budget`

For the agent itself — returns the status of the active per-task budget (set via `set_budget`):

```
check_budget()
→ { spent_tokens: 1234, limit_tokens: 5000, remaining: 3766 }
```

Returns "No active task budget" if no task budget is set.

### `set_budget`

The agent sets its own per-task budget for the current session:

```
set_budget(tokens: 5000, description: "research task")
```

Resets at the end of the session (`agent_end`).

### `budget_status`

For the owner — queries historical spend:

```
budget_status({ period: "today", operationType: "user_message" })
→ "Today: 4,231 tokens / $0.18 (user messages)"

budget_status({ period: "this_week" })
→ "This week: 42,800 tokens / $1.84 (all operations)"
```

---

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `budget.daily_tokens` | number \| null | `null` | Max tokens per context per day. |
| `budget.daily_cost_usd` | number \| null | `null` | Max spend (USD) per context per day. |
| `budget.session_tokens` | number \| null | `null` | Max tokens per session. |
| `budget.session_cost_usd` | number \| null | `null` | Max spend (USD) per session. |
| `budget.turn_tokens` | number \| null | `null` | Max tokens per single agent turn. |
| `budget.turn_cost_usd` | number \| null | `null` | Max spend (USD) per turn. |
| `budget.warn_threshold` | number | `0.8` | Fraction of limit at which a warning is emitted. |
