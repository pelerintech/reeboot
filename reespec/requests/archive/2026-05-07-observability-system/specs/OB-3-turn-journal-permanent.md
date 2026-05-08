# OB-3: Turn Journal — Permanent Record

The turn_journal stops self-destructing on success. Successful turns are retained as audit
evidence. Old closed turns are pruned on a retention schedule.

---

## OB-3-A: closeTurn marks closed, does not delete

GIVEN a turn has completed successfully  
WHEN `TurnJournal.closeTurn(turnId)` is called  
THEN the `turn_journal` row is updated to `status = 'closed'` and `closed_at = datetime('now')`  
AND the row is NOT deleted  
AND the turn_journal_steps rows for that turn are NOT deleted  
AND `getOpenJournals()` does NOT return the now-closed turn (it filters by `status = 'open'`)

---

## OB-3-B: Open turns remain crash evidence

GIVEN a turn journal row exists with `status = 'open'`  
WHEN `getOpenJournals()` is called  
THEN it returns the open row and its steps  
AND the existing resilience recovery logic is unaffected

---

## OB-3-C: Closed turns are queryable

GIVEN multiple turns have completed (status = 'closed')  
WHEN `getClosedTurns(db, { limit: 20 })` is called  
THEN it returns the 20 most recent closed turns ordered by `closed_at DESC`  
AND each entry includes the turn's steps

---

## OB-3-D: Retention pruning removes old closed turns

GIVEN closed turn_journal rows older than `retention_days` (default 30)  
WHEN `pruneTurns(db, retentionDays)` is called  
THEN rows with `status = 'closed'` and `closed_at` older than the retention window are deleted  
AND cascades to `turn_journal_steps` via existing FK ON DELETE CASCADE  
AND open rows are never deleted by pruning
