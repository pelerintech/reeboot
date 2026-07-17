# Spec — ree-messages-skip

In ree mode the orchestrator does not write the shared `messages` table; durable history lives in
per-chat `chat_messages`.

## S1 — ree turn writes no messages rows
- **GIVEN** ree mode
- **WHEN** a customer turn completes
- **THEN** `SELECT count(*) FROM messages` for that turn is 0.

## S2 — per-chat history still persisted
- **GIVEN** the same ree turn
- **WHEN** it completes
- **THEN** `chat_messages` has the user + assistant rows scoped to that conversationId.

## S3 — pi mode still writes messages (regression)
- **GIVEN** pi mode and a non-synthetic turn
- **WHEN** it completes
- **THEN** the `messages` table has the user and assistant rows as before.
