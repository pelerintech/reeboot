# Spec — ree-security-extensions (WS-C3)

The ree extension subset includes injection-guard and trust-enforcer, and (given WS-A3) their hooks
take effect.

## S1 — ree factory list registers the security hooks
- **GIVEN** the factories returned by `getReeFactories(config)` applied to a chat's adapter
- **WHEN** registration completes
- **THEN** the chat's emitter has at least one `before_agent_start` listener (injection-guard) and at
  least one `tool_call` listener (trust-enforcer).

## S2 — injection-guard's policy block reaches the prompt (depends on WS-A3)
- **GIVEN** injection-guard wired into a ree chat and an untrusted end-user message
- **WHEN** a ree `prompt()` runs
- **THEN** the system prompt sent to the model includes injection-guard's external-content policy block
  (proving the `before_agent_start` return value is honored end-to-end).

## S3 — pi behavior unchanged
- **GIVEN** the pi factory list
- **WHEN** built
- **THEN** it still includes injection-guard and trust-enforcer as before (no regression).
