# Spec — turn-rollup-ui

The observability (Activity) page seeds from `GET /api/events`, groups events by `traceId` (shared
across a turn's events) into expandable turn cards showing status and failure reason, and keeps tailing
live audit records over the existing SSE stream. It no longer uses `/api/logs` as its primary source.
A group is a "turn" iff it contains a `turn_*` event; other groups render standalone.

## S1 — seeds from /api/events on mount
- **GIVEN** `GET /api/events?level=info` is stubbed to return one `turn_started` event
  (`turnId:'T1'`, `contextId:'main'`)
- **WHEN** the Activity component mounts
- **THEN** it calls `fetch` for `/api/events?level=info` (not `/api/logs`), and after it resolves a
  turn entry for the seeded event is rendered.

## S2 — events with the same traceId group into one turn showing status
- **GIVEN** the endpoint returns a `turn_started` and a `turn_completed`, both `traceId:'TR1'`
- **WHEN** the component mounts and renders
- **THEN** a single turn card for `TR1` is shown with status "completed" (the two events are grouped,
  not rendered as two separate top-level rows).

## S3 — a failed turn shows the failure reason
- **GIVEN** the endpoint returns `turn_started` (`traceId:'TR2'`) and `turn_failed`
  (`traceId:'TR2'`, `payload.reason:'provider timeout'`, severity 17)
- **WHEN** the component renders the `TR2` turn
- **THEN** the turn is shown with status "failed" and the reason text "provider timeout" is visible.

## S4 — a non-turn event renders as a standalone system entry
- **GIVEN** the endpoint returns a `budget_warning` event (`turnId: null`, its own unique `traceId`,
  no `turn_*` sibling)
- **WHEN** the component renders
- **THEN** the event is shown as a standalone entry (not rendered as a turn card).

## S5 — changing the level filter refetches from /api/events
- **GIVEN** the Activity component is mounted at level `info`
- **WHEN** the level filter is changed to `error`
- **THEN** `fetch` is called again with `/api/events?level=error`.

## S6 — live audit SSE records append after the seed
- **GIVEN** the view is seeded with a `turn_started` event for `traceId:'TR1'`
- **WHEN** a live record with `component:'audit'`, event type `turn_completed`, `trace_id:'TR1'`
  arrives over the `EventSource`
- **THEN** the `TR1` turn updates to status "completed" (live record merged into the seeded turn).

## S7 — non-audit live records are ignored by the Activity view
- **GIVEN** the view is seeded and connected to the live stream
- **WHEN** a live record with `component:'scheduler'` (a raw pino log, not an audit event) arrives
- **THEN** it is not rendered as a turn or system entry in the Activity view.
