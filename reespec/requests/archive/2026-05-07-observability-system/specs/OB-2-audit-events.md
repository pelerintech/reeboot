# OB-2: Audit Events

Domain-level structured events written to the `events` table. OTEL-ready schema.

---

## OB-2-A: Events table exists after migration

GIVEN `runObservabilityMigration(db)` is called  
WHEN the migration runs on a fresh database  
THEN the `events`, `session_events`, `rate_limits`, and `operational_logs` tables exist  
AND `turn_journal` has a `closed_at` column  
AND the migration is idempotent (safe to call multiple times)

---

## OB-2-B: emitEvent writes a structured row

GIVEN the events table exists  
WHEN `emitEvent(db, { type: 'turn_started', contextId: 'main', severity: 9 })` is called  
THEN a row is inserted with a generated UUID `id`  
AND `trace_id` is a 32-char hex string  
AND `span_id` is a 16-char hex string  
AND `created_ns` is the current Unix epoch in nanoseconds  
AND `severity` matches the provided value (OTEL numbers: 9=INFO, 13=WARN, 17=ERROR, 21=FATAL)

---

## OB-2-C: Turn lifecycle events are emitted

GIVEN an agent turn runs to completion  
WHEN the turn starts  
THEN an `events` row of type `turn_started` is inserted with `context_id` and `channel`  
WHEN the turn ends successfully  
THEN an `events` row of type `turn_completed` is inserted with `durationMs` in payload  
WHEN the turn times out or errors  
THEN an `events` row of type `turn_failed` is inserted with `reason` in payload

---

## OB-2-D: Scheduler events are emitted

GIVEN a scheduled task fires  
WHEN the task is dispatched to the orchestrator  
THEN an `events` row of type `scheduler_fired` is inserted with `taskId` and `contextId` in payload

---

## OB-2-E: Swallowed events are emitted

GIVEN a heartbeat or scheduler turn triggers a system reply (error, timeout, disk warning)  
WHEN `Orchestrator._reply()` swallows it (because `channelType` is `heartbeat` or `scheduler`)  
THEN an `events` row of type `swallowed_reply` is inserted with `channelType`, `reason`, and `text` in payload  
AND severity is WARN (13)

---

## OB-2-F: Channel connect/disconnect events are emitted

GIVEN a channel adapter changes status  
WHEN a channel connects (status → `connected`)  
THEN an `events` row of type `channel_connected` is inserted with `channelType`  
WHEN a channel disconnects or errors  
THEN an `events` row of type `channel_disconnected` is inserted with `channelType` and `reason`
