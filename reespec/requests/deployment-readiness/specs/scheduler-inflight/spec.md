# Spec — scheduler-inflight (WS-E4, defensive)

The scheduler does not dispatch a task that is already in flight. (Latent hardening — no active bug
under current serial polling; the `_inFlight` set becomes live.)

## S1 — an in-flight task is not double-dispatched
- **GIVEN** a due task whose handler hangs (never resolves) so `next_run` is not yet updated
- **WHEN** two poll cycles run while it is in flight
- **THEN** the task's handler is invoked exactly once (the second poll skips the in-flight task).

## S2 — in-flight entry is cleared after completion
- **GIVEN** a task that runs and completes
- **WHEN** its run finishes
- **THEN** it is removed from `_inFlight` (a later due occurrence can run again).

## S3 — cancelJob still clears in-flight
- **GIVEN** an in-flight task that is cancelled
- **WHEN** `cancelJob(id)` runs
- **THEN** the id is removed from `_inFlight` (existing behavior preserved).
