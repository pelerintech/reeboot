# TB-3: Agentic Per-Task Budget

Tools for the agent to self-manage a per-task spending constraint.

---

## TB-3-A: set_budget registers a task budget

GIVEN the `budget-manager` extension is loaded  
WHEN the agent calls `set_budget({ amount: 5, unit: 'usd' })`  
THEN the budget is stored in the extension closure  
AND `.task_budget.json` is written to the context workspace with `{ amount: 5, unit: 'usd', startCost: <current_accumulated> }`  
AND `set_budget` returns a confirmation: "Budget set: $5.00 for this task"

GIVEN `set_budget({ amount: 500000, unit: 'tokens' })`  
THEN the budget is stored and confirmed: "Budget set: 500k tokens for this task"

---

## TB-3-B: turn_end accumulates cost against the task budget

GIVEN a task budget of $5.00 is active  
WHEN pi fires `turn_end` with `event.message.usage.cost.total = 1.20`  
THEN the extension closure accumulates $1.20 against the budget  
AND subsequent calls to `check_budget()` show $1.20 spent

WHEN pi fires `turn_end` again with `cost.total = 0.80`  
THEN accumulated spend is $2.00

---

## TB-3-C: check_budget returns current spend vs limits

GIVEN a task budget of $5.00 and $2.00 accumulated  
WHEN the agent calls `check_budget()`  
THEN it returns:
```
Task budget: $2.00 spent of $5.00 (40% used, $3.00 remaining)
Daily global: $2.84 of $10.00 (28% used)
```

GIVEN no active task budget  
WHEN the agent calls `check_budget()`  
THEN it returns only the global limits section (or "No active task budget")

---

## TB-3-D: Budget exhaustion injects wrap-up instruction

GIVEN a task budget of $5.00  
WHEN accumulated spend reaches or exceeds $5.00  
THEN on the next `turn_start` the extension injects into the agent context:
  *"⚠️ TASK BUDGET EXHAUSTED ($5.02 of $5.00 used). Immediately stop all further tool calls.
   Deliver whatever you have completed so far as your final response. Do not start new work."*  
AND a `budget_exhausted` audit event is emitted  
AND the task budget is cleared from the closure after the wrap-up turn completes

---

## TB-3-E: Budget cleared after task completes

GIVEN a task budget was active and the agent delivered a final response  
WHEN `agent_end` fires  
THEN the task budget closure is reset to null  
AND `.task_budget.json` is deleted from the workspace  
AND subsequent turns start with no active task budget
