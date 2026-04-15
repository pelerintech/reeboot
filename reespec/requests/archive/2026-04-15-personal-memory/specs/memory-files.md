# Spec: Memory Files

## Capability

Persistent memory storage as two bounded markdown files — `MEMORY.md` and `USER.md` — initialised on first use, read at session start, written by the agent via the `memory` tool.

---

## Scenarios

### GIVEN the memories directory does not exist
### WHEN the memory-manager extension initialises
### THEN `~/.reeboot/memories/MEMORY.md` and `USER.md` are created with empty content headers

---

### GIVEN memory files exist with content
### WHEN `before_agent_start` fires
### THEN both files are read and injected as a frozen block into the system prompt
### AND the block includes usage percentage and char counts for each file
### AND the block is not re-read or mutated during the session

---

### GIVEN `memory.enabled` is false
### WHEN `before_agent_start` fires
### THEN no memory block is injected into the system prompt
### AND the `memory` tool is NOT registered
### AND the `session_search` tool IS registered

---

### GIVEN memory files are empty
### WHEN `before_agent_start` fires
### THEN the system prompt block is injected with empty content sections
### AND usage shows 0% for both files
