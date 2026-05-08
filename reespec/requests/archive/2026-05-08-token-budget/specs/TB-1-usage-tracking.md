# TB-1: Usage Tracking

Enhanced usage table with cost and operation type. Token-meter persists both.

---

## TB-1-A: Usage table has cost_usd and operation_type columns

GIVEN `runBudgetMigration(db)` is called on a fresh database  
WHEN the migration runs  
THEN the `usage` table has a `cost_usd REAL` column defaulting to 0  
AND the `usage` table has an `operation_type TEXT` column defaulting to `'user_message'`  
AND the migration is idempotent (safe to call multiple times)

---

## TB-1-B: Token-meter persists cost

GIVEN the updated `token-meter.ts` is loaded  
WHEN pi fires `agent_end` with messages containing `usage.cost.total = 0.042`  
THEN the `usage` row inserted has `cost_usd = 0.042`  
AND `input_tokens` and `output_tokens` are still persisted as before

---

## TB-1-C: Token-meter reads operation_type from workspace meta file

GIVEN the orchestrator has written `.reeboot_turn_meta.json` with `operationType: 'scheduler'`  
WHEN pi fires `agent_end`  
THEN the `usage` row has `operation_type = 'scheduler'`

GIVEN no `.reeboot_turn_meta.json` file exists in the workspace  
WHEN pi fires `agent_end`  
THEN the `usage` row has `operation_type = 'user_message'` (default)

---

## TB-1-D: Orchestrator writes turn meta before dispatch

GIVEN the orchestrator receives a message with `channelType = 'memory'`  
WHEN it dispatches the turn  
THEN `.reeboot_turn_meta.json` exists in the context workspace with `operationType = 'memory'`  
AND the file is written before `runner.prompt()` is called
