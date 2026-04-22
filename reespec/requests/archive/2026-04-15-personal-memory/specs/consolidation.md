# Spec: Memory Consolidation

## Capability

A background scheduled process that mines past conversations from the `messages` table and distils cross-session patterns into `MEMORY.md` and `USER.md`. Runs on a configurable schedule. Logs every run to `memory_log`.

---

## Scenarios

### GIVEN the database is initialised
### WHEN the schema migration runs
### THEN a `memory_log` table exists with columns: id, ran_at, trigger, sessions_processed, ops_applied, memory_chars_before, memory_chars_after, user_chars_before, user_chars_after, notes

---

### GIVEN `memory.consolidation.enabled` is true and a schedule is configured
### WHEN the scheduler initialises
### THEN a consolidation task is registered with the configured cron schedule

---

### GIVEN `memory.consolidation.enabled` is false
### WHEN the scheduler initialises
### THEN no consolidation task is registered

---

### GIVEN recent messages exist in the database since the last consolidation
### WHEN the consolidation task runs
### THEN it reads messages since the last `memory_log` entry
### AND builds a consolidation prompt with those messages + current memory contents
### AND calls the LLM to identify new insights
### AND applies the resulting add/replace/remove operations to MEMORY.md and USER.md
### AND writes a `memory_log` row with trigger='consolidation', sessions_processed, ops_applied, char counts

---

### GIVEN no new messages exist since the last consolidation run
### WHEN the consolidation task runs
### THEN it writes a `memory_log` row with ops_applied=0
### AND MEMORY.md and USER.md are NOT modified

---

### GIVEN MEMORY.md would exceed capacity after consolidation inserts
### WHEN the consolidation process applies operations
### THEN it auto-consolidates existing entries to make room (merges related entries)
### AND writes a `memory_log` row with trigger='auto-capacity'
### AND the final MEMORY.md content is within the configured char limit

---

### GIVEN a consolidation run completes
### WHEN `memory_log` is queried
### THEN the latest row shows ran_at, sessions_processed > 0, and ops_applied count
