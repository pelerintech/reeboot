# TB-2: Global Limits

Pre-dispatch enforcement of per-turn, per-session, and per-day caps.

---

## TB-2-A: No limits = no enforcement

GIVEN `config.budget` has all limit fields set to `null`  
WHEN `BudgetGuard.check(db, contextId, config)` is called  
THEN it returns `{ ok: true }` immediately  
AND no `usage` table queries are made

---

## TB-2-B: Daily token limit blocks when breached

GIVEN `config.budget.daily_tokens = 100000`  
AND the `usage` table shows 105000 tokens consumed today for this context  
WHEN `BudgetGuard.check(db, contextId, config)` is called  
THEN it returns `{ ok: false, reason: 'Daily token limit reached (105000 / 100000)' }`  
AND the orchestrator does not dispatch the turn  
AND the owner receives a message explaining the block

---

## TB-2-C: Daily cost limit blocks when breached

GIVEN `config.budget.daily_cost_usd = 5.0`  
AND the `usage` table shows $5.42 cost_usd consumed today  
WHEN `BudgetGuard.check(db, contextId, config)` is called  
THEN it returns `{ ok: false, reason: 'Daily cost limit reached ($5.42 / $5.00)' }`

---

## TB-2-D: Warn threshold fires before hard stop

GIVEN `config.budget.daily_tokens = 100000` and `config.budget.warn_threshold = 0.8`  
AND the `usage` table shows 82000 tokens consumed today  
WHEN `BudgetGuard.check(db, contextId, config)` is called  
THEN it returns `{ ok: true, warning: 'Daily token usage at 82% (82000 / 100000)' }`  
AND the orchestrator dispatches the turn (not blocked)  
AND a `budget_warning` audit event is emitted  
AND the owner is notified once per threshold crossing (not on every subsequent turn)

---

## TB-2-E: Session limit checks current session spend

GIVEN `config.budget.session_tokens = 50000`  
AND this session has consumed 52000 tokens  
WHEN `BudgetGuard.check(db, contextId, config)` is called  
THEN it returns `{ ok: false, reason: 'Session token limit reached (52000 / 50000)' }`

---

## TB-2-F: Turn limit uses last turn's actual cost

GIVEN `config.budget.turn_tokens = 10000`  
AND the most recent `usage` row for this context has `input_tokens + output_tokens = 12000`  
WHEN `BudgetGuard.check(db, contextId, config)` is called before the next turn  
THEN it returns `{ ok: false, reason: 'Last turn exceeded per-turn token limit (12000 / 10000)' }`  
AND a warning is sent to the owner explaining that the previous turn was oversized
