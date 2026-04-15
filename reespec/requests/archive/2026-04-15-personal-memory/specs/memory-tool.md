# Spec: Memory Tool

## Capability

The `memory` tool lets the agent add, replace, and remove entries from `MEMORY.md` and `USER.md` during a session. Changes persist to disk immediately and are visible from the next session.

---

## Scenarios

### GIVEN memory.enabled is true
### WHEN the extension initialises
### THEN a `memory` tool is registered with actions: add, replace, remove

---

### GIVEN MEMORY.md has available capacity
### WHEN the agent calls `memory(action="add", target="memory", content="User prefers TypeScript")`
### THEN the entry is appended to MEMORY.md
### AND the tool returns success with updated char count

---

### GIVEN USER.md has available capacity
### WHEN the agent calls `memory(action="add", target="user", content="Name: Alex, timezone: EST")`
### THEN the entry is appended to USER.md
### AND the tool returns success with updated char count

---

### GIVEN MEMORY.md contains "User prefers TypeScript"
### WHEN the agent calls `memory(action="replace", target="memory", old_text="TypeScript", content="User prefers TypeScript over JavaScript")`
### THEN the matching entry is updated in MEMORY.md
### AND the tool returns success

---

### GIVEN MEMORY.md contains "staging server port 2222"
### WHEN the agent calls `memory(action="remove", target="memory", old_text="staging server")`
### THEN the matching entry is removed from MEMORY.md
### AND the tool returns success with updated char count

---

### GIVEN MEMORY.md is at 95% capacity
### WHEN the agent calls `memory(action="add", target="memory", content="...")` that would exceed the limit
### THEN the tool returns an error
### AND the error includes current entries and remaining capacity
### AND MEMORY.md is NOT modified

---

### GIVEN MEMORY.md contains "User prefers bullet points"
### WHEN the agent calls `memory(action="add", target="memory", content="User prefers bullet points")`
### THEN the tool returns success with a "no duplicate added" message
### AND MEMORY.md is NOT modified

---

### WHEN the agent calls `memory` with content containing "ignore previous instructions"
### THEN the tool returns a security rejection error
### AND the file is NOT modified

---

### WHEN the agent calls `memory` with content containing invisible Unicode characters
### THEN the tool returns a security rejection error
### AND the file is NOT modified
