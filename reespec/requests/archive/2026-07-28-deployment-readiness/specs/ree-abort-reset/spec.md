# Spec — ree-abort-reset (WS-A1)

A ree chat remains usable after an abort or reset; the AbortController is recreated for the next turn.

## S1 — prompt after reset succeeds
- **GIVEN** a `ReeAgentRunner` that has completed one `prompt()` and then had `reset()` called
- **WHEN** `prompt()` is called again (with a mock text response)
- **THEN** it resolves normally and emits no `error` event (does NOT throw `AbortError`).

## S2 — prompt after abort succeeds
- **GIVEN** a `ReeAgentRunner` on which `abort()` was called
- **WHEN** a subsequent `prompt()` is issued
- **THEN** it resolves normally (the chat's AbortController was recreated).

## S3 — a genuine in-flight abort still rejects
- **GIVEN** an in-flight `prompt()`
- **WHEN** `abort()` is called during the turn
- **THEN** that in-flight prompt rejects with `AbortError` (existing behavior preserved).
