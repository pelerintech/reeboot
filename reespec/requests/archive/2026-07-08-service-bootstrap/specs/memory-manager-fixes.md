# Spec — Memory Manager Fixes

## Capability

`memory-manager.ts` registers its consolidation job via `registerServerJobs()` (not `session_start`). `session_search` uses ESM-compatible dynamic import for DB access.

## Scenarios

### GIVEN memory.enabled and memory.consolidation.enabled are both true
WHEN `registerServerJobs(db, scheduler, config)` is called
THEN `scheduler.registerJob()` is called with `{ id: '__memory_consolidation__', ... }`
AND the schedule matches `config.memory.consolidation.schedule`

### GIVEN memory.enabled is false
WHEN `registerServerJobs(db, scheduler, config)` is called
THEN `scheduler.registerJob()` is NOT called

### GIVEN memory.consolidation.enabled is false
WHEN `registerServerJobs(db, scheduler, config)` is called
THEN `scheduler.registerJob()` is NOT called

### GIVEN `makeMemoryExtension` is called
WHEN the extension factory runs
THEN there is NO `session_start` handler registered on `pi`
(job registration moved to registerServerJobs, not tied to session lifecycle)

### GIVEN the session_search tool is called
WHEN the DB is available via the singleton
THEN the tool returns search results without throwing a ReferenceError
(no require() in ESM module)

### GIVEN the session_search tool is called and the DB is not yet open
WHEN getDb() throws
THEN the tool returns `{ results: [], error: 'Database not available' }` gracefully
AND no unhandled exception propagates
