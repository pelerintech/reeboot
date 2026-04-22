# Spec: turn-journal

## Capability

Every agent turn opens an ephemeral journal row in SQLite. Each completed tool call is appended as a step. On successful turn completion the journal row and all its steps are deleted. An unclosed row after restart signals a crashed turn.

---

## Scenarios

### Journal row is created at turn start

GIVEN the orchestrator receives an incoming message  
WHEN `_runTurn` begins  
THEN a row exists in `turn_journal` with `status = 'open'` and the original prompt  
AND the row's `context_id` matches the routing context

---

### Tool call outputs are appended to the journal

GIVEN a turn is in progress with an open journal row  
WHEN a tool call completes (tool_call_end event)  
THEN a row is inserted in `turn_journal_steps` with:  
- `turn_id` matching the open journal  
- `tool_name` matching the tool that ran  
- `tool_input` containing the full input JSON  
- `tool_output` containing the full output (no truncation)  
- `is_error` set appropriately  
- monotonically increasing `seq`

---

### Journal is deleted on successful turn completion

GIVEN a turn completes without error  
WHEN the runner resolves  
THEN no row exists in `turn_journal` for that turn_id  
AND no rows exist in `turn_journal_steps` for that turn_id

---

### Journal remains open after a simulated crash

GIVEN a turn is in progress with tool calls appended  
WHEN the runner throws an unhandled error (simulated crash)  
THEN the `turn_journal` row still exists with `status = 'open'`  
AND `turn_journal_steps` rows for completed steps are still present

---

### Journal remains open after turn timeout

GIVEN a turn exceeds the configured turn timeout  
WHEN the orchestrator aborts the runner  
THEN the `turn_journal` row remains open (not deleted)

---

### Stale journals older than 24h are cleaned up on startup

GIVEN a `turn_journal` row with `started_at` more than 24 hours ago  
WHEN the startup recovery scan runs  
THEN the stale row is deleted without triggering recovery flow  
AND a warning is logged
