# Distillation — session_shutdown triggers summary generation

## ID: hot-memory-1

**Given** a session has been active (messages exchanged via the orchestrator)  
**When** the inactivity timer fires on that context, calling `runner.reset()`  
**And** the `session_shutdown` event fires with `reason: 'new'`  
**Then** the hot-memory extension queries new messages from the `messages` table since the last distill timestamp  
**And** calls the LLM to generate a 2–3 line summary of the conversation  
**And** writes the formatted entry (date, title, summary, conclusions) to `~/.reeboot/memories/hot-memory.md`

---

## ID: hot-memory-2

**Given** the `session_shutdown` event fires with `reason: 'new'`  
**When** the hot-memory extension queries the `messages` table  
**And** finds zero new messages since the last distill timestamp (empty session)  
**Then** the extension does NOT write a new entry to hot memory  
**And** does NOT call the LLM

---

## ID: hot-memory-3

**Given** the `session_shutdown` event fires  
**When** the LLM call for distillation fails (network error, model unavailable)  
**Then** the extension does NOT crash the process  
**And** does NOT write a new entry to hot memory  
**And** the existing hot memory file is left unchanged
