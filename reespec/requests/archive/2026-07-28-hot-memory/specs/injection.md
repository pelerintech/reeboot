# Injection — before_agent_start adds hot memory to system prompt

## ID: hot-memory-4

**Given** hot memory exists (entries in `~/.reeboot/memories/hot-memory.md`)  
**When** a new user message arrives and `before_agent_start` fires  
**Then** the hot-memory extension reads the hot memory file  
**And** appends a `[HOT MEMORY]` block to the system prompt containing:
  - The hot memory entries
  - Instructions for using hot memory with `session_search` when the user references a past conversation

---

## ID: hot-memory-5

**Given** hot memory is empty (no entries in `~/.reeboot/memories/hot-memory.md`)  
**When** a new user message arrives and `before_agent_start` fires  
**Then** the hot-memory extension injects a minimal `[HOT MEMORY]` awareness block stating the agent has no past session records  
**And** the block does NOT contain any session entries or `session_search` instructions

---

## ID: hot-memory-6

**Given** the hot memory file does not exist (first ever server start)  
**When** a new user message arrives and `before_agent_start` fires  
**Then** the extension does NOT crash  
**And** does NOT inject any hot memory block  
**And** the system prompt is unchanged
