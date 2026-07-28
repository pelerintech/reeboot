# Spec — budget-session-window (WS-D1)

Session budget limits count only usage since the process/session start, not all of the current day.

## S1 — session spend excludes pre-session rows
- **GIVEN** a `usage` row of 40000 tokens stamped before session start and one of 20000 tokens after,
  a `BudgetGuard` constructed with that session start, and `session_tokens: 30000`
- **WHEN** `guard.check(db, 'ctx1', config)` runs
- **THEN** the result is `ok: true` (session spend counted = 20000, not 60000).

## S2 — session breach still triggers within the window
- **GIVEN** two in-session rows totaling 35000 tokens and `session_tokens: 30000`
- **WHEN** checked
- **THEN** `ok: false` with a session-limit reason.

## S3 — daily limits unaffected
- **GIVEN** rows spanning the day and a daily limit
- **WHEN** checked
- **THEN** daily accounting still uses the start-of-day window (no regression).
