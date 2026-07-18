# Spec — logs-history-api

`GET /api/logs` returns persisted log history from `operational_logs`, mapped to the UI's `LogRecord`
shape, so the Logs page can seed cross-run history.

## S1 — returns persisted logs mapped to LogRecord shape
- **GIVEN** `operational_logs` has a row `{ level: 40, msg: 'disk slow', component: 'scheduler' }`
- **WHEN** a client sends `GET /api/logs?level=info`
- **THEN** the response is `200` and contains an object
  `{ timestamp: <created_at>, level: 'warn', component: 'scheduler', message: 'disk slow' }`
  (numeric level `40` mapped to string `'warn'`; `msg` mapped to `message`).

## S2 — level filter excludes lower severities
- **GIVEN** `operational_logs` has one `info` (30) row and one `error` (50) row
- **WHEN** a client sends `GET /api/logs?level=error`
- **THEN** only the `error` row is returned (the `info` row is excluded).

## S3 — default level is info and returns chronological order
- **GIVEN** `operational_logs` has an `info` row then a `warn` row (in that insertion order)
- **WHEN** a client sends `GET /api/logs` (no `level` param)
- **THEN** both rows are returned in ascending (oldest-first) order, info before warn.

## S4 — limit returns the most recent N in chronological order
- **GIVEN** `operational_logs` has 5 rows at level `info`
- **WHEN** a client sends `GET /api/logs?limit=2`
- **THEN** exactly 2 items are returned — the most recent two — in ascending order.

## S5 — empty table returns empty array
- **GIVEN** `operational_logs` is empty
- **WHEN** a client sends `GET /api/logs`
- **THEN** the response is `200` with body `[]`.
