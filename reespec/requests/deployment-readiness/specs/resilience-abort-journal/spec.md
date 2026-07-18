# Spec — resilience-abort-journal (WS-E5)

A user-cancelled turn closes its turn-journal so crash recovery does not re-queue it on restart.

## S1 — abort closes the journal
- **GIVEN** an orchestrator with a turn journal and a runner whose `prompt()` rejects with an
  `AbortError`
- **WHEN** a message is dispatched and the turn aborts
- **THEN** there are zero `turn_journal` rows with `status = 'open'` for that turn (it was closed).

## S2 — recovery does not re-queue a cancelled turn
- **GIVEN** the journal state after an aborted turn
- **WHEN** `getOpenJournals(db)` is read (the input to recovery)
- **THEN** it does not include the aborted turn.

## S3 — a real crash (timeout) still leaves an open journal (regression)
- **GIVEN** a turn that times out (not an AbortError)
- **WHEN** it ends
- **THEN** its journal remains `open` (intentional crash evidence — unchanged).
