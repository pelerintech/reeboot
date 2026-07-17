# Spec — events-retention-bound

`pruneObservabilityData` bounds `events` growth by a severity-tiered time window plus a per-context row
cap, so the audit store cannot balloon under fan-out. Config supplies the windows and cap with safe
defaults.

## S1 — INFO events past the short window are pruned
- **GIVEN** `events` has an INFO row (severity 9) with `created_at` 10 days ago and another INFO row
  from today, and `eventsInfoRetentionDays = 7`
- **WHEN** `pruneObservabilityData(db, { retentionDays: 30, eventsInfoRetentionDays: 7,
  eventsMaxRowsPerContext: 5000 })` runs
- **THEN** the 10-day-old INFO row is deleted and today's INFO row remains.

## S2 — WARN+ events within the main window are retained
- **GIVEN** `events` has a WARN row (severity 13) with `created_at` 10 days ago and
  `eventsInfoRetentionDays = 7`, `retentionDays = 30`
- **WHEN** `pruneObservabilityData` runs
- **THEN** the 10-day-old WARN row is retained (only INFO is subject to the short window).

## S3 — events past the main window are pruned regardless of severity
- **GIVEN** `events` has a WARN row (severity 13) with `created_at` 40 days ago and `retentionDays = 30`
- **WHEN** `pruneObservabilityData` runs
- **THEN** the 40-day-old WARN row is deleted.

## S4 — per-context row cap keeps only the newest N
- **GIVEN** `context_id='main'` has 6 events (ascending `created_ns`) and `eventsMaxRowsPerContext = 5`
- **WHEN** `pruneObservabilityData` runs
- **THEN** exactly 5 rows remain for `main` and they are the 5 most recent; the oldest is deleted.

## S5 — row cap is applied per context independently
- **GIVEN** `main` has 6 events and `work` has 2 events, with `eventsMaxRowsPerContext = 5`
- **WHEN** `pruneObservabilityData` runs
- **THEN** `main` has 5 rows and `work` still has 2 (one context's overflow does not evict another's).

## S6 — back-compatible numeric call still works
- **GIVEN** existing callers invoke `pruneObservabilityData(db, 30)` (a bare number)
- **WHEN** it runs against a populated `events`/`operational_logs`
- **THEN** it prunes by the 30-day window without throwing (info-tier and cap use their defaults).
