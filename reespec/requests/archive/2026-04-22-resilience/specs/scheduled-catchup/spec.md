# Spec: scheduled-catchup

## Capability

On startup, tasks whose `next_run` is in the past are evaluated against a catchup window. Tasks missed within the window are fired immediately. Tasks missed beyond the window have their `next_run` advanced to the next natural occurrence without firing.

---

## Scenarios

### Task missed within global catchup window — fires immediately

GIVEN a task with `status = 'active'` and `next_run` 30 minutes in the past  
AND `resilience.scheduler.catchup_window === '1h'`  
AND the task has no `catchup` column override  
WHEN the catchup scan runs on startup  
THEN the task's `next_run` is set to now (or past) so the scheduler poll picks it up immediately  
AND the task fires once

---

### Task missed beyond global catchup window — skipped

GIVEN a task with `status = 'active'` and `next_run` 3 hours in the past  
AND `resilience.scheduler.catchup_window === '1h'`  
WHEN the catchup scan runs on startup  
THEN the task's `next_run` is advanced to the next natural scheduled occurrence  
AND the task does NOT fire at startup

---

### Task with catchup='always' fires regardless of age

GIVEN a task with `status = 'active'`, `next_run` 48 hours in the past  
AND the task's `catchup` column is `'always'`  
WHEN the catchup scan runs on startup  
THEN the task fires once at startup

---

### Task with catchup='never' is always skipped

GIVEN a task with `status = 'active'`, `next_run` 5 minutes in the past  
AND the task's `catchup` column is `'never'`  
WHEN the catchup scan runs on startup  
THEN the task does NOT fire at startup  
AND `next_run` is advanced to the next natural occurrence

---

### Task with per-task catchup window of '2h' — evaluated against custom window

GIVEN a task with `status = 'active'`, `next_run` 90 minutes in the past  
AND the task's `catchup` column is `'2h'`  
WHEN the catchup scan runs on startup  
THEN the task fires (90 min < 2h window)

---

### Multiple missed tasks — each evaluated independently, no burst deduplication issue

GIVEN three tasks all overdue at startup  
WHEN the catchup scan runs  
THEN each is evaluated independently  
AND at most one fire is triggered per task regardless of how many natural periods were missed
