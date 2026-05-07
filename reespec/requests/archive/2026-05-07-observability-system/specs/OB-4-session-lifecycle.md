# OB-4: Session Lifecycle Events

Captures pi's session_shutdown event with reason and links crashes to the open turn.

---

## OB-4-A: session_shutdown is captured

GIVEN the observability extension is loaded in a pi session  
WHEN pi fires `session_shutdown` with `{ reason: 'quit' }`  
THEN a `session_events` row is inserted with `reason = 'quit'`, `context_id`, and `created_at`  
AND the same applies for reasons: `reload`, `new`, `resume`, `fork`

---

## OB-4-B: Crash links to open turn

GIVEN a turn_journal row is open (turn in progress)  
WHEN pi fires `session_shutdown` with any reason while that turn is open  
THEN the `session_events` row is inserted with `linked_turn_id` set to the open turn's `turn_id`  
AND `reason` is set to `'crash'` (overriding whatever pi reported, since an open turn = crash evidence)  
AND `session_path` is set from the `targetSessionFile` field if present

---

## OB-4-C: Clean shutdown has no linked turn

GIVEN no turn_journal rows are open (all turns completed cleanly)  
WHEN pi fires `session_shutdown` with `reason = 'quit'`  
THEN the `session_events` row is inserted with `linked_turn_id = NULL`  
AND `reason = 'quit'`
