# Spec — ree-context-resolution

In ree mode, context resolution uses the message's `conversationId`.

## S1 — ree resolves to conversationId
- **GIVEN** ree mode (`config.sdk === 'ree'`) and a message with `conversationId:'cust-42'`
- **WHEN** `_resolveContext(msg)` runs
- **THEN** it returns `'cust-42'`.

## S2 — ree falls back when conversationId absent
- **GIVEN** ree mode and a message with no `conversationId`
- **WHEN** `_resolveContext(msg)` runs
- **THEN** it falls back to `peerId` then `routing.default` (existing behavior).

## S3 — pi mode ignores conversationId
- **GIVEN** pi mode and a message with `conversationId:'x'`
- **WHEN** `_resolveContext(msg)` runs
- **THEN** the field is ignored and routing rules/default apply as today.
