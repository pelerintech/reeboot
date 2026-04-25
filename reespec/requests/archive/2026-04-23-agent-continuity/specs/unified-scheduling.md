# Spec: Unified Scheduling

## Capability

All time-based agent actions go through `schedule_task` (DB-persisted, survives restart).
The `timer` tool is removed. Tasks store origin channel and peer. When a task fires, the
prompt is enriched with routing instructions. Tasks without an origin broadcast to all
channels.

---

## Scenarios

### US-1: timer tool is no longer registered

GIVEN the scheduler extension is loaded  
WHEN `pi.getActiveTools()` is called  
THEN the tool list does NOT contain `timer`

### US-2: schedule_task accepts origin_channel and origin_peer

GIVEN the agent calls `schedule_task` with `origin_channel: 'whatsapp'` and `origin_peer: '+40X'`  
WHEN the task row is written to DB  
THEN the row has `origin_channel = 'whatsapp'` and `origin_peer = '+40X'`

### US-3: Fired task prompt is enriched with routing instructions

GIVEN a task with `origin_channel: 'whatsapp'` and `origin_peer: '+40X'` becomes due  
WHEN the scheduler fires it  
THEN the prompt delivered to the agent contains the original task prompt  
AND contains routing instructions referencing `whatsapp` and `+40X`  
(Delivery is handled transparently by the orchestrator's `_reply()` — no `send_message` tool call required from the agent)

### US-4: Fired task with no origin instructs broadcast

GIVEN a task with `origin_channel: NULL` and `origin_peer: NULL` becomes due  
WHEN the scheduler fires it  
THEN the prompt instructs the agent to broadcast to all available channels

### US-5: Scheduled task reply reaches the correct channel adapter

GIVEN a task with `origin_channel: 'whatsapp'` and `origin_peer: '+40X'`  
WHEN the task fires and the agent produces a response  
THEN the reply is delivered via the whatsapp adapter to peer `+40X`  
AND NOT silently dropped  
(The orchestrator reads `origin_channel`/`origin_peer` from `msg.raw` and routes automatically — no agent tool call needed)

### US-6: Tasks DB columns survive migration on existing DB

GIVEN an existing `tasks` table without `origin_channel` / `origin_peer` columns  
WHEN `runResilienceMigration` is called  
THEN the columns are added  
AND existing task rows are unaffected (columns default to NULL)

### US-7: Removed timer tool does not break heartbeat

GIVEN the timer tool is removed  
WHEN `heartbeat({ action: 'start', interval_seconds: 10, message: 'ping' })` is called  
THEN the heartbeat starts successfully  
(heartbeat is a separate tool that must not be touched)

### US-8: schedule_task with "in 15 minutes" style schedule creates correct next_run

GIVEN the agent calls `schedule_task` with `schedule: "in 15 minutes"` and an origin  
WHEN the task row is created  
THEN `next_run` is within 1 second of `now + 15 minutes`
