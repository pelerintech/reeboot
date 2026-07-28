# Spec — turn-trace-correlation

The orchestrator mirrors a turn's `turnId` into the `trace_id` of every event it emits for that turn,
so all of a turn's events share one 32-hex trace id (OTEL: trace = turn, span = event). This makes
`trace_id` the reliable audit correlation key.

## S1 — a turn's lifecycle events share one trace_id
- **GIVEN** an orchestrator with a mock runner that completes successfully, and a DB with the `events`
  table migrated
- **WHEN** one user message is dispatched and the turn completes
- **THEN** the `turn_started` and `turn_completed` rows in `events` have the **same** non-empty
  `trace_id`.

## S2 — trace_id equals the turnId with hyphens removed
- **GIVEN** the same successful turn
- **WHEN** its `turn_started` row is inspected
- **THEN** its `trace_id` equals `payload.turnId` with all `-` removed, and is 32 lowercase hex chars.

## S3 — a failed turn shares the same trace_id as its start
- **GIVEN** an orchestrator with a runner that throws a non-retryable error
- **WHEN** one user message is dispatched and the turn fails
- **THEN** the `turn_started` and `turn_failed` rows share the same `trace_id`.

## S4 — distinct turns get distinct trace_ids
- **GIVEN** two separate user messages producing two turns
- **WHEN** both complete
- **THEN** the two turns' events fall into two different `trace_id` values (no cross-turn collision).
