# Spec: Graceful Reload Teardown

## Capability 1 — mcp-manager skips disconnect on reload

GIVEN the mcp-manager extension is loaded  
WHEN `session_shutdown` fires with `reason: "reload"`  
THEN `_pool.disconnectAll()` is NOT called

GIVEN the mcp-manager extension is loaded  
WHEN `session_shutdown` fires with `reason: "quit"`  
THEN `_pool.disconnectAll()` IS called

GIVEN the mcp-manager extension is loaded  
WHEN `session_shutdown` fires with any reason other than `"reload"`  
THEN `_pool.disconnectAll()` IS called (safe default)

## Capability 2 — scheduler-tool skips timer clear on reload

GIVEN the scheduler-tool extension is loaded  
WHEN `session_shutdown` fires with `reason: "reload"`  
THEN `manager.clearAll()` is NOT called

GIVEN the scheduler-tool extension is loaded  
WHEN `session_shutdown` fires with `reason: "quit"`  
THEN `manager.clearAll()` IS called

## Capability 3 — skill-manager skips poll loop stop on reload

GIVEN the skill-manager extension is loaded  
WHEN `session_shutdown` fires with `reason: "reload"`  
THEN `clearInterval(loop)` is NOT called

GIVEN the skill-manager extension is loaded  
WHEN `session_shutdown` fires with `reason: "quit"`  
THEN `clearInterval(loop)` IS called
