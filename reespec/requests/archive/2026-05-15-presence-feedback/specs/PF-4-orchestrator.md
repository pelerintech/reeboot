# Spec PF-4 — Orchestrator presence wiring

## Capability

The orchestrator calls `startTyping` at the start of a real user turn and
`stopTyping` in a `finally` block that covers all exit paths. Synthetic
channel types (scheduler, heartbeat, recovery, memory) are excluded.

---

## Scenarios

### PF-4-A: startTyping is called at the start of a real user turn

GIVEN an orchestrator with a WhatsApp adapter that implements `startTyping`  
WHEN a message arrives on channelType `"whatsapp"`  
THEN `adapter.startTyping(msg)` is called before `runner.prompt()`

### PF-4-B: stopTyping is called after a successful turn

GIVEN an orchestrator with an adapter that implements `stopTyping`  
WHEN a turn completes successfully  
THEN `adapter.stopTyping(msg)` is called

### PF-4-C: stopTyping is called after a turn timeout

GIVEN an orchestrator configured with a very short `turnTimeout`  
AND an adapter that implements `stopTyping`  
AND a runner that never resolves  
WHEN the turn times out  
THEN `adapter.stopTyping(msg)` is called

### PF-4-D: stopTyping is called after a turn error

GIVEN an orchestrator with an adapter that implements `stopTyping`  
AND a runner that throws an error  
WHEN the turn errors  
THEN `adapter.stopTyping(msg)` is called

### PF-4-E: No presence calls for synthetic channel types

GIVEN an orchestrator with an adapter that implements `startTyping`  
WHEN a message arrives with channelType `"scheduler"`, `"heartbeat"`,
`"recovery"`, or `"memory"`  
THEN `adapter.startTyping` is NOT called

### PF-4-F: Missing presence methods are silently skipped

GIVEN an orchestrator with an adapter that does NOT implement `startTyping`  
or `stopTyping`  
WHEN a user turn runs  
THEN no error is thrown — the optional call is safely skipped
