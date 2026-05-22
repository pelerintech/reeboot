# Spec: Memory Consolidation Race Condition Fix

## Capability

The memory extension's consolidation job is reliably registered with the global scheduler after the real scheduler is initialized, not at extension load time when only a no-op stub exists.

---

## Scenarios

### MC-1: Consolidation job registers after scheduler is set

GIVEN `memory.enabled: true` AND `consolidation.enabled: true` in config  
AND the memory extension factory is called  
AND `globalScheduler` is initially `noopScheduler`  
WHEN `setGlobalScheduler(realScheduler)` is called (simulating server startup)  
AND a `session_start` event fires  
THEN the real scheduler receives a `registerJob` call with id `__memory_consolidation__`  
AND the schedule matches `memoryConfig.consolidation.schedule`

### MC-2: No double-registration on session reload

GIVEN the memory extension is loaded  
AND the consolidation job is already registered  
WHEN another `session_start` event fires (e.g. after `/reload`)  
THEN `registerJob` is NOT called a second time for `__memory_consolidation__`

### MC-3: Job does not register when consolidation is disabled

GIVEN `memory.enabled: true` AND `consolidation.enabled: false` in config  
WHEN `setGlobalScheduler(realScheduler)` is called  
AND a `session_start` event fires  
THEN `registerJob` is NOT called for `__memory_consolidation__`

### MC-4: Job does not register when memory is disabled

GIVEN `memory.enabled: false` in config  
WHEN `setGlobalScheduler(realScheduler)` is called  
AND a `session_start` event fires  
THEN `registerJob` is NOT called for `__memory_consolidation__`  
AND no error is thrown

### MC-5: Existing registration at load time is removed

GIVEN the previous version of `memory-manager.ts`  
WHEN the file is examined  
THEN there is NO call to `globalScheduler.registerJob` inside `makeMemoryExtension`  
AND the registration logic lives inside a `session_start` handler instead

### MC-6: runConsolidation function remains callable

GIVEN the memory extension is loaded  
WHEN `runConsolidation(opts)` is called directly (e.g. from a scheduler-fired task)  
THEN it reads messages, calls `llmCall`, parses ops, and writes to memory files  
AND no error is thrown
