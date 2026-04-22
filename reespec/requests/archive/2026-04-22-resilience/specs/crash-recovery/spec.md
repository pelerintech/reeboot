# Spec: crash-recovery

## Capability

On startup, reeboot scans for unclosed turn journals. For each one it applies the configured recovery policy: auto-resume (safe turns only, always, or never) or notify the user via all channels and ask what to do.

---

## Scenarios

### No unclosed journals — startup proceeds normally

GIVEN no rows exist in `turn_journal`  
WHEN the startup recovery scan runs  
THEN no recovery notification is sent  
AND the server proceeds to normal startup

---

### Unclosed journal with only read-only tools, mode=safe_only — auto-resumes

GIVEN a `turn_journal` row with steps containing only tools not in `side_effect_tools`  
AND `resilience.recovery.mode === 'safe_only'`  
WHEN the startup recovery scan runs  
THEN the original prompt is re-queued into the orchestrator  
AND the journal row is deleted  
AND a "I was restarted and am re-running your request" notification is broadcast to all channels

---

### Unclosed journal with side-effectful tool fired, mode=safe_only — notifies user

GIVEN a `turn_journal` row with at least one step whose `tool_name` is in `side_effect_tools`  
AND `resilience.recovery.mode === 'safe_only'`  
WHEN the startup recovery scan runs  
THEN a notification is broadcast to all channels listing the interrupted turn and tools that already fired  
AND the journal row is deleted  
AND the prompt is NOT automatically re-queued

---

### mode=always — auto-resumes regardless of side effects

GIVEN a `turn_journal` row with side-effectful tool steps  
AND `resilience.recovery.mode === 'always'`  
WHEN the startup recovery scan runs  
THEN the original prompt is re-queued  
AND the journal row is deleted

---

### mode=never — always notifies, never auto-resumes

GIVEN a `turn_journal` row (any steps)  
AND `resilience.recovery.mode === 'never'`  
WHEN the startup recovery scan runs  
THEN a notification is broadcast to all channels  
AND the prompt is NOT automatically re-queued  
AND the journal row is deleted

---

### Multiple unclosed journals — each handled independently

GIVEN two `turn_journal` rows for different contexts  
WHEN the startup recovery scan runs  
THEN each is processed according to its steps and the recovery policy  
AND notifications are sent once per interrupted turn
