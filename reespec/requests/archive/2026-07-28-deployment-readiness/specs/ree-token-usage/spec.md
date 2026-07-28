# Spec — ree-token-usage (WS-A2)

The ree agent loop records token usage so metering and budget enforcement work.

## S1 — agent_end assistant message carries usage
- **GIVEN** a ree `prompt()` whose model stream's final (`RUN_FINISHED`) chunk includes
  `usage: { promptTokens: 12, completionTokens: 7 }`
- **WHEN** the loop finishes and emits `agent_end`
- **THEN** the last assistant message in the payload has `usage` with
  `inputTokens: 12` and `outputTokens: 7`.

## S2 — usage propagates to turn_end and message_end
- **GIVEN** the same stream
- **WHEN** the loop emits `turn_end` and the `message_end` RunnerEvent
- **THEN** both carry the same non-zero token counts (not the hardcoded zeros).

## S3 — token-meter writes a usage row for a ree turn
- **GIVEN** the token-meter extension active on a ree chat and a turn with non-zero usage
- **WHEN** the turn ends
- **THEN** a row is inserted into the `usage` table with matching input/output tokens
  (previously never written because usage was 0).
