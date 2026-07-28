# Spec — events-history-api

`GET /api/events` returns curated audit events from the `events` table, mapped to a stable shape with
the turn-correlation id extracted, so the Activity page can seed a turn-grouped audit history.

## S1 — returns audit events in chronological order
- **GIVEN** `events` has three rows for `context_id='main'` inserted in order (`turn_started`,
  `turn_completed`, `budget_warning`) with ascending `created_ns`
- **WHEN** a client sends `GET /api/events`
- **THEN** the response is `200` and a JSON array of exactly those three events in ascending
  (oldest-first) order, each with `id`, `timestamp`, `type`, `level`, `severity`, `contextId`,
  `traceId`.

## S2 — severity/level filter excludes lower severities
- **GIVEN** `events` has one INFO (severity 9) row and one ERROR (severity 17) row
- **WHEN** a client sends `GET /api/events?level=error`
- **THEN** only the ERROR row is returned (the INFO row is excluded).

## S3 — traceId column and turnId (from payload) are both surfaced
- **GIVEN** a `turn_started` event with `trace_id = 'abc123...'` (32 hex) and `payload`
  `{"turnId":"T-123","peerId":"p1"}`
- **WHEN** a client sends `GET /api/events`
- **THEN** the returned object has `traceId === 'abc123...'` (from the column), `turnId === "T-123"`
  (extracted from payload), and `payload` is a parsed object (not a JSON string) containing
  `peerId: "p1"`.

## S4 — events with no turn payload return turnId null but still carry their traceId
- **GIVEN** a `budget_warning` event whose `payload` has no `turnId` (and its own unique `trace_id`)
- **WHEN** a client sends `GET /api/events`
- **THEN** the returned object has `turnId === null` (a standalone/system event) and `traceId` equals
  that event's own `trace_id`.

## S5 — context filter returns only that context's events
- **GIVEN** `events` has rows for both `main` and `work`
- **WHEN** a client sends `GET /api/events?context=main`
- **THEN** every returned row has `contextId === 'main'`; no `work` rows appear.

## S6 — limit returns the most recent N in chronological order
- **GIVEN** `events` has 5 rows for `main` (e1..e5 by ascending `created_ns`)
- **WHEN** a client sends `GET /api/events?limit=2`
- **THEN** exactly 2 items are returned — the most recent two (e4, e5) — in ascending order (e4 before e5).

## S7 — empty table returns empty array
- **GIVEN** `events` is empty
- **WHEN** a client sends `GET /api/events`
- **THEN** the response is `200` with body `[]`.
