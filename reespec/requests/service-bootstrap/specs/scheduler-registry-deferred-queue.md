# Spec — Scheduler Registry Deferred Queue

## Capability

`scheduler-registry.ts` queues `registerJob()` calls that arrive before `setGlobalScheduler()` is called, then drains them in order when the real scheduler is set.

## Scenarios

### GIVEN the real scheduler has not yet been set
WHEN `registerJob({ id: 'job-a', ... })` is called
THEN the job is not forwarded to any scheduler
AND the job is held in an internal pending queue

### GIVEN one job is pending in the queue
WHEN `setGlobalScheduler(realScheduler)` is called
THEN `realScheduler.registerJob()` is called with the pending job
AND the pending queue is emptied

### GIVEN multiple jobs are pending in the queue
WHEN `setGlobalScheduler(realScheduler)` is called
THEN `realScheduler.registerJob()` is called once for each pending job, in registration order
AND the pending queue is emptied

### GIVEN the real scheduler is already set
WHEN `registerJob({ id: 'job-b', ... })` is called
THEN `realScheduler.registerJob()` is called immediately
AND nothing is added to the pending queue

### GIVEN a job was registered before and after setGlobalScheduler
WHEN the system is inspected
THEN both jobs were registered with the real scheduler exactly once

### GIVEN setGlobalScheduler is called twice (e.g. test teardown/re-init)
WHEN a new scheduler is set
THEN only jobs still in the pending queue (if any) are drained — already-delivered jobs are not re-sent
