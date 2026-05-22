# Spec: Capabilities Discovery Extension

## Capability

A bundled extension that discovers all registered tools (excluding pi built-ins) and injects a structured capabilities block into the system prompt on every session start.

---

## Scenarios

### CD-1: Extension loads and registers before_agent_start handler

GIVEN the extension loader includes the capabilities factory  
WHEN `makeCapabilitiesExtension(pi)` is called  
THEN a `before_agent_start` handler is registered on `pi`

### CD-2: Capabilities block contains reeboot bundled tools

GIVEN the capabilities extension is loaded  
AND `memory`, `session_search`, `set_budget`, and `schedule_task` tools are registered  
WHEN the `before_agent_start` event fires  
THEN the returned `systemPrompt` contains a capabilities block  
AND the block lists `memory` with its description  
AND the block lists `session_search` with its description  
AND the block lists `set_budget` with its description  
AND the block lists `schedule_task` with its description

### CD-3: Built-in pi tools are excluded

GIVEN the capabilities extension is loaded  
AND `bash`, `read`, `edit`, `write`, `grep`, `find`, `ls` are registered by pi  
WHEN the `before_agent_start` event fires  
THEN the returned `systemPrompt` does NOT contain `bash` in the capabilities block  
AND does NOT contain `read`  
AND does NOT contain any other pi built-in tool

### CD-4: Block is structured with tool names, descriptions, and usage hints

GIVEN the capabilities extension is loaded  
AND the `memory` tool is registered with description "Manage persistent memory entries"  
WHEN the `before_agent_start` event fires  
THEN the capabilities block contains the text "memory"  
AND the text "Manage persistent memory entries"  
AND a usage hint explaining when to call the tool

### CD-5: Block is injected once per session via before_agent_start

GIVEN a new agent session is created  
WHEN the first `before_agent_start` event fires  
THEN the returned `systemPrompt` contains the capabilities block  
AND on subsequent turns in the same session  
AND on subsequent `before_agent_start` events  
THEN the block is still present (idempotent append)

### CD-6: capabilities_injected event is emitted

GIVEN the capabilities extension is loaded  
AND the observability extension is loaded  
WHEN the `before_agent_start` event fires  
THEN an event with `type: 'capabilities_injected'` is written to the `events` table  
AND the payload contains `toolCount` equal to the number of advertised tools  
AND the payload contains `toolNames` as an array of strings  
AND the payload contains `sourceBreakdown` with counts per source category

### CD-7: Empty tool list produces minimal block

GIVEN the capabilities extension is loaded  
AND no custom tools are registered (only pi built-ins)  
WHEN the `before_agent_start` event fires  
THEN the returned `systemPrompt` contains a minimal block stating "No additional tools registered"  
AND no error is thrown

### CD-8: Tool count cap prevents oversized blocks

GIVEN the capabilities extension is loaded  
AND 50+ custom tools are registered  
WHEN the `before_agent_start` event fires  
THEN the capabilities block contains at most 30 tools  
AND the block notes "… and N more tools" for the remainder  
AND the `capabilities_injected` event payload reflects the capped count

### CD-9: User extensions are automatically discovered

GIVEN a user extension registers a tool `my_custom_tool` without `promptSnippet`  
AND the capabilities extension is loaded  
WHEN the `before_agent_start` event fires  
THEN the capabilities block contains `my_custom_tool` with its description
