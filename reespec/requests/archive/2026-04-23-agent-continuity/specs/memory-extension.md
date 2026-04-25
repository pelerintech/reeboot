# Spec: Memory Extension Wiring

## Capability

The memory extension loads in production, receives config, accesses DB and scheduler via
require(), injects memory into every session's system prompt, and makes session_search
available regardless of whether memory is enabled.

---

## Scenarios

### ME-1: Extension present in compiled output

GIVEN `npm run build` has been run  
WHEN `dist/extensions/memory-manager.js` is checked  
THEN the file exists and is non-empty

### ME-2: session_search registered when memory disabled

GIVEN `memory.enabled: false` in config  
WHEN the memory extension factory is called  
THEN the `session_search` tool is registered  
AND the `memory` tool is NOT registered  
AND no `before_agent_start` injection is registered

### ME-3: session_search registered when memory enabled

GIVEN `memory.enabled: true` in config  
WHEN the memory extension factory is called  
THEN the `session_search` tool is registered  
AND the `memory` tool is registered  
AND a `before_agent_start` handler is registered

### ME-4: Memory injected into system prompt

GIVEN `memory.enabled: true`  
AND `~/.reeboot/memories/MEMORY.md` contains one or more entries  
AND `~/.reeboot/memories/USER.md` contains one or more entries  
WHEN the `before_agent_start` event fires  
THEN the returned system prompt suffix contains the MEMORY.md content  
AND the USER.md content  
AND char count / percentage annotations

### ME-5: session_search queries messages table

GIVEN the `messages` table contains rows with known content  
WHEN `session_search({ query: "<known term>" })` is called  
THEN results contain at least one row with a matching excerpt  
AND each result has `role`, `created_at`, and `excerpt` fields

### ME-6: session_search returns empty on no match

GIVEN the `messages` table contains rows  
WHEN `session_search({ query: "xyzzy_no_match_term_9999" })` is called  
THEN results is an empty array (not an error)

### ME-7: Consolidation task registered with scheduler

GIVEN `memory.enabled: true` AND `consolidation.enabled: true`  
WHEN the memory extension factory is called  
THEN a task with id `__memory_consolidation__` is registered with the global scheduler  
AND its schedule matches `consolidation.schedule` from config

### ME-8: Config values respected

GIVEN config has `memoryCharLimit: 1000` and `userCharLimit: 500`  
WHEN the `memory` tool is called with content exceeding those limits  
THEN the tool returns a capacity error referencing the configured limits (not hardcoded defaults)
