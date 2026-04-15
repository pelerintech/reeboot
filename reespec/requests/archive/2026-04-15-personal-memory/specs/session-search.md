# Spec: Session Search

## Capability

FTS5 full-text search over the `messages` table, available to the agent as a `session_search` tool — always registered regardless of `memory.enabled`.

---

## Scenarios

### GIVEN the database is initialised
### WHEN the schema migration runs
### THEN a `messages_fts` FTS5 virtual table exists on the messages table
### AND existing messages are backfilled into the FTS index

---

### GIVEN new messages are inserted into the `messages` table
### WHEN the INSERT trigger fires
### THEN the FTS index is updated automatically

---

### GIVEN `memory.enabled` is false
### WHEN the extension initialises
### THEN `session_search` tool is registered

---

### GIVEN `memory.enabled` is true
### WHEN the extension initialises
### THEN `session_search` tool is registered

---

### GIVEN past messages contain "TypeScript monorepo"
### WHEN the agent calls `session_search(query="TypeScript monorepo")`
### THEN matching messages are returned with role, created_at, and content excerpt
### AND results are ordered by relevance

---

### GIVEN past messages contain no matches for "quantum entanglement"
### WHEN the agent calls `session_search(query="quantum entanglement")`
### THEN an empty results array is returned
### AND no error is thrown

---

### WHEN the agent calls `session_search(query="billing", limit=5)`
### THEN at most 5 results are returned
