# Spec — ree-runner-eviction

Lazily-created ree runners and their per-context state are evicted on inactivity so orchestrator maps
stay bounded.

## S1 — inactive conversation evicted from orchestrator maps
- **GIVEN** a factory-created ree runner for `conversationId:'A'` and its `_contextState`
- **WHEN** the inactivity timeout for A elapses
- **THEN** `_runners` and `_contextState` no longer contain `'A'`, and the runner's `dispose()` was called.

## S2 — a re-arriving conversation is re-created
- **GIVEN** A was evicted
- **WHEN** a new message for A arrives
- **THEN** a runner is created again and the turn runs (history resumes from `chat_messages` unless it
  was idle-pruned by `ReeRuntime`).

## S3 — pi runners are not evicted
- **GIVEN** pi mode with the static `main` runner
- **WHEN** inactivity elapses
- **THEN** the `main` runner remains in `_runners` (session reset only, per existing behavior).
