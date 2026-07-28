# Spec — ree-before-agent-start-hooks (WS-A3)

ree honors the return value of `before_agent_start` handlers so extensions can inject into the system
prompt. (Prerequisite for WS-C3 injection-guard/capabilities to be effective in ree.)

## S1 — a returned systemPrompt is merged
- **GIVEN** a handler registered via `chat.adapter.on('before_agent_start', () => ({ systemPrompt: 'BASE\n## INJECTED' }))`
- **WHEN** `emitBeforeAgentStart({ prompt:'x', systemPrompt:'BASE', systemPromptOptions:{} })` is awaited
- **THEN** the returned payload's `systemPrompt` contains `## INJECTED`.

## S2 — the merged prompt reaches the model
- **GIVEN** the same handler registered on a chat
- **WHEN** `prompt()` runs through the mock adapter
- **THEN** the serialized request body sent to the model includes the injected text
  (i.e. the emit happens before the chat options are built).

## S3 — no handler leaves the prompt unchanged
- **GIVEN** no `before_agent_start` handler beyond defaults
- **WHEN** the loop runs
- **THEN** the system prompt equals the configured `config.ree.systemPrompt` (no regression).
