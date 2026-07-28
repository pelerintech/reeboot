# Spec — budget-warning-ordering (WS-D2)

A soft warning on one metric must not mask a hard breach on another.

## S1 — hard breach wins over a token warning
- **GIVEN** usage that is in the warn band on daily tokens (e.g. 82% of limit) but OVER the daily cost
  hard limit
- **WHEN** `guard.check(...)` runs
- **THEN** the result is `ok: false` with the daily-cost breach reason (not `ok: true` with a token
  warning).

## S2 — warning still returned when no hard limit is breached
- **GIVEN** usage in the warn band and no hard limit exceeded
- **WHEN** checked
- **THEN** `ok: true` with a `warning` set.

## S3 — warn-once dedup preserved
- **GIVEN** the same warn band hit twice
- **WHEN** checked twice
- **THEN** the warning is returned once (dedup via `_warnedKeys` unchanged).
