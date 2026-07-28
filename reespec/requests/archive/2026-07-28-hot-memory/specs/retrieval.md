# Retrieval — agent uses hot memory + session_search when user references past

## ID: hot-memory-7

**Given** hot memory contains a session about "Research on quantum computing"  
**When** the user says "We talked about quantum computing a while back, bring back those conclusions"  
**Then** the agent should identify the matching session in hot memory  
**And** call `session_search` with terms related to "quantum computing"  
**And** respond with actual details from the past conversation (not just the summary)

---

## ID: hot-memory-8

**Given** hot memory contains sessions about unrelated topics  
**And** the user says "We talked about topic X a while back"  
**When** the agent scans hot memory and finds no match for topic X  
**Then** the agent asks the user if the conversation was from more than a few sessions ago  
**And** based on the user's guidance, does a broader `session_search` across all sessions

---

## ID: hot-memory-9

**Given** hot memory is empty (no prior sessions)  
**When** the user says "We talked about this before"  
**Then** the agent responds that it doesn't have any past session records  
**And** does NOT call `session_search` (nothing useful to find)
