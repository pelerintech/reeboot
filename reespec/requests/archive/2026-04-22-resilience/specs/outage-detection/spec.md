# Spec: outage-detection

## Capability

The orchestrator counts consecutive provider-related turn failures per context. When the count reaches `resilience.outage_threshold`, an outage is declared: an `outage_events` row is inserted, all channels are notified, and a self-healing probe task is created in the scheduler. Subsequent failed turns during the outage are recorded as lost jobs. A successful turn resets the failure counter.

---

## Scenarios

### Consecutive provider failures below threshold — no outage declared

GIVEN `resilience.outage_threshold === 3`  
WHEN 2 consecutive turns fail with a provider error (HTTP 503)  
THEN no `outage_events` row is inserted  
AND no broadcast notification is sent  
AND no probe task is created

---

### Consecutive provider failures reach threshold — outage declared

GIVEN `resilience.outage_threshold === 3`  
WHEN 3 consecutive turns fail with provider errors  
THEN a row is inserted in `outage_events` with `resolved_at = NULL`  
AND a broadcast notification is sent to all channels  
AND a probe task is created in `tasks` with `context_id = '__outage_probe__'`

---

### Successful turn resets failure counter

GIVEN 2 consecutive failures have been counted  
WHEN the next turn succeeds  
THEN the consecutive failure counter for that context resets to 0  
AND no outage is declared

---

### Non-provider errors do not count toward outage threshold

GIVEN a turn fails with a non-provider error (e.g. tool error, abort)  
WHEN the failure counter is checked  
THEN the outage counter is NOT incremented

---

### Failed turn during active outage is recorded as a lost job

GIVEN an outage is already declared (outage_events row exists with `resolved_at = NULL`)  
WHEN another turn fails  
THEN the turn's context_id and prompt are appended to the `lost_jobs` JSON in the active outage_events row  
AND no second outage is declared

---

### Lost jobs are capped at 20 entries

GIVEN an active outage with 20 lost jobs already recorded  
WHEN another turn fails  
THEN the lost_jobs list remains at 20 entries  
AND a truncation flag is set on the outage_events row
