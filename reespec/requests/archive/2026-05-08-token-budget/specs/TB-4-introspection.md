# TB-4: Channel-Accessible Spend Introspection

budget_status() tool for answering spend questions from any channel.

---

## TB-4-A: Daily spend query

GIVEN the `usage` table has rows for today  
WHEN the agent calls `budget_status({ period: 'today' })`  
THEN it returns a human-readable summary:
  "Today: $2.84 spent (142k tokens input / 46k tokens output)"  
AND if a daily limit is configured: "— $7.16 of $10.00 remaining (28% used)"  
AND if no limit is configured: "— no daily limit set"

---

## TB-4-B: Operation-type filtered query

GIVEN the `usage` table has rows with `operation_type = 'memory'`  
WHEN the agent calls `budget_status({ operationType: 'memory', period: 'last' })`  
THEN it returns the cost and token counts for the most recent memory operation  
  "Last memory run: $0.12 (8k tokens)"

GIVEN no memory rows exist  
WHEN the agent calls `budget_status({ operationType: 'memory', period: 'last' })`  
THEN it returns "No memory operations found"

---

## TB-4-C: Provider without pricing returns token-only summary

GIVEN the active model has `cost.input = 0` and `cost.output = 0` (local/Ollama model)  
AND the `usage` table rows have `cost_usd = 0`  
WHEN the agent calls `budget_status({ period: 'today' })`  
THEN it returns "Today: 142k tokens input / 46k tokens output (cost unavailable for this model)"  
AND does not show $0.00 as if free — explicitly notes cost is unavailable

---

## TB-4-D: budget_status answers common natural language queries

GIVEN the agent receives a user question: "how much of your daily budget is left?"  
WHEN the agent calls `budget_status({ period: 'today' })`  
THEN the tool result contains enough information for the agent to answer naturally  
AND the agent can relay it in plain language to any channel (WhatsApp, Signal, Web)
