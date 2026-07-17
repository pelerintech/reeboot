# Spec — logs-history-ui

The Logs page seeds persisted history from `GET /api/logs` on mount and when the level filter
changes, then continues to tail live records via SSE.

## S1 — Logs page seeds history on mount
- **GIVEN** `GET /api/logs?level=info` is stubbed to return
  `[{timestamp:'2026-07-17 09:00:00',level:'info',component:'server',message:'started'}]`
- **WHEN** the `Logs` component mounts
- **THEN** it calls `fetch` for `/api/logs?level=info`, and after resolution the row "started" is
  rendered (i.e. the page is not empty before any live SSE record arrives).

## S2 — changing the level filter refetches history
- **GIVEN** the `Logs` component is mounted at level `info`
- **WHEN** the level filter is changed to `error`
- **THEN** `fetch` is called again with `/api/logs?level=error`.

## S3 — live SSE records still append after the seed
- **GIVEN** history is seeded with one record
- **WHEN** a new record arrives over the live `EventSource`
- **THEN** the new record is appended to the list in addition to the seeded record (seed + live
  coexist).
