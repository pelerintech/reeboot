# Spec: Session Resume

## Capability

On restart, the agent loads the most recent session file (within the inactivity window) rather
than starting blank. If the last message in that session was from the user with no reply,
a notification is broadcast.

---

## Scenarios

### SR-1: Resume within inactivity window

GIVEN a sessions directory containing pi-format files (`<ISO-timestamp>_<uuid>.jsonl`)  
AND the most recent file was modified less than `inactivityTimeout` ms ago  
WHEN `getResumedSessionPath(contextId, inactivityMs, reebotDir)` is called  
THEN it returns the full path to the most recent `.jsonl` file

### SR-2: No resume when session is stale

GIVEN a sessions directory containing `.jsonl` files  
AND the most recent file was modified more than `inactivityTimeout` ms ago  
WHEN `getResumedSessionPath(contextId, inactivityMs, reebotDir)` is called  
THEN it returns `null`

### SR-3: No resume when directory is empty

GIVEN a sessions directory that exists but contains no `.jsonl` files  
WHEN `getResumedSessionPath(contextId, inactivityMs, reebotDir)` is called  
THEN it returns `null`

### SR-4: Most recent file wins

GIVEN a sessions directory with multiple `.jsonl` files at different timestamps  
WHEN `getResumedSessionPath(contextId, inactivityMs, reebotDir)` is called  
THEN it returns the file with the lexicographically latest name (most recent timestamp)

### SR-5: Old `session-*.json` files are ignored

GIVEN a sessions directory containing both old-format `session-*.json` files  
AND new-format `<ISO-timestamp>_<uuid>.jsonl` files  
WHEN `getResumedSessionPath` is called  
THEN only `.jsonl` files are considered

### SR-6: Unanswered message triggers notification

GIVEN `getResumedSessionPath` returns a path  
AND the session file's last message entry has `role: 'user'` with no subsequent assistant entry  
WHEN the server starts and scans the session  
THEN a broadcast notification is sent to all channel adapters referencing the unanswered message snippet
