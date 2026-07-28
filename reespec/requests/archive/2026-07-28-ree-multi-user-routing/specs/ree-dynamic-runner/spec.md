# Spec — ree-dynamic-runner

An orchestrator runner-resolver lazily creates and reuses a per-conversation `ReeAgentRunner` over the
shared `ReeRuntime`.

## S1 — first message creates a runner
- **GIVEN** ree mode with a runner factory injected and no runner for `conversationId:'A'`
- **WHEN** a message for `A` is dispatched
- **THEN** a runner is created, stored in `_runners['A']`, and the turn runs (no "No runner found" reply).

## S2 — subsequent messages reuse the same runner
- **GIVEN** a runner already created for `A`
- **WHEN** a second message for `A` arrives
- **THEN** the same runner instance is used (not re-created).

## S3 — pi mode with unknown context still errors
- **GIVEN** pi mode (no factory) and a message resolving to an unknown context
- **WHEN** dispatched
- **THEN** the orchestrator replies "No runner found" (existing behavior preserved).

## S4 — the created runner is keyed to the conversation
- **GIVEN** a runner created for `A`
- **WHEN** it prompts
- **THEN** it drives `ReeRuntime.getOrCreateChat('A')` (chatId == conversationId).
