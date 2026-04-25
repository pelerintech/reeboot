# Spec: outage-recovery

## Capability

A probe task with `context_id = '__outage_probe__'` runs on a schedule (default every hour). The orchestrator handles it without invoking the agent runner — it issues a raw HTTP connectivity check to the provider endpoint. On two consecutive successful probes the outage is resolved: `outage_events` is updated, the probe task is deleted, channels are notified, and lost jobs are surfaced for the user to decide whether to re-run.

---

## Scenarios

### Probe task is handled without invoking the agent runner

GIVEN a task row with `context_id = '__outage_probe__'`  
WHEN the scheduler poll fires the task  
THEN `handleScheduledTask` processes it as an infrastructure probe  
AND `runner.prompt()` is NOT called  
AND an HTTP GET is made to the configured provider's endpoint

---

### Probe fails — outage continues, probe reschedules normally

GIVEN an active outage  
WHEN the probe HTTP check fails (connection refused or 5xx)  
THEN the `outage_events` row remains unresolved  
AND the probe task's `next_run` advances to the next probe interval  
AND no channel notification is sent

---

### Two consecutive probe successes — outage resolved

GIVEN an active outage  
WHEN the probe HTTP check succeeds twice consecutively  
THEN `outage_events.resolved_at` is set to now  
AND the probe task is deleted from `tasks`  
AND `_consecutiveFailures` counter is reset for all contexts  
AND a broadcast recovery notification is sent to all channels listing lost jobs

---

### Recovery notification includes lost jobs list

GIVEN an outage with 3 lost jobs recorded  
WHEN outage is resolved  
THEN the broadcast message includes the prompt text of each lost job  
AND instructs the user to re-send any they want re-run

---

### Recovery notification with truncated lost jobs — notes truncation

GIVEN an outage with 20+ lost jobs (truncation flag set)  
WHEN outage is resolved  
THEN the broadcast message states that some jobs were not captured due to volume

---

### No active outage — probe task does not exist

GIVEN no outage has been declared  
THEN no task with `context_id = '__outage_probe__'` exists in the `tasks` table
