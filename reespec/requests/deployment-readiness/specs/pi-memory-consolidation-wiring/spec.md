# Spec — pi-memory-consolidation-wiring (WS-E1b)

The pi (single-user) memory consolidation job actually runs the structured `runConsolidation` pipeline
instead of being dispatched to the agent as a literal prompt. (Discovery miss on E1: the sentinel was
"never intercepted"; E1 fixed only the ree removal and left pi broken. Owner: pi consolidation is a key
capability. Design: STRUCTURED — intercept the sentinel and call `runConsolidation`.)

Background: today the scheduler fires `__memory_consolidation__`, the scheduler-task handler
(`server.ts:284`) calls `buildScheduledPrompt` and publishes a `channelType:'scheduler'` message to the
bus, so the sentinel string runs as an ordinary LLM turn; `runConsolidation` is never called in `src/`.

## S1 — a one-shot llmCall can be built from config
- **GIVEN** a config with an active model (provider/id/apiKey, openai-completions api) and an injected
  `fetch`
- **WHEN** `createLlmCall(config, fetchImpl)('hello')` is awaited
- **THEN** it issues one POST to the configured completions endpoint carrying the prompt, and returns
  the assistant text from the response (asserted via the mocked `fetch`).

## S2 — the scheduler handler routes the consolidation sentinel to runConsolidation, not the bus
- **GIVEN** a scheduler-task handler built with a fake bus, a spy `runConsolidation`, and a stub `llmCall`
- **WHEN** it handles a task `{ taskId:'__memory_consolidation__', prompt:'__memory_consolidation__: …' }`
- **THEN** the spy `runConsolidation` is called exactly once and `bus.publish` is NOT called (the turn
  is not dispatched to the agent).

## S3 — a normal scheduled task still dispatches to the bus (regression)
- **GIVEN** the same handler
- **WHEN** it handles a normal task `{ taskId:'t1', prompt:'remind me' }`
- **THEN** `bus.publish` is called once with a `channelType:'scheduler'` message and `runConsolidation`
  is NOT called.

## S4 — end-to-end: a fired consolidation job updates memory, no agent turn
- **GIVEN** a DB seeded with `messages`, the consolidation job registered (pi mode), and an injected
  `llmCall` returning `ADD memory: user prefers dark mode`
- **WHEN** the consolidation task fires through the scheduler handler
- **THEN** a `memory_log` row is written and `MEMORY.md` contains the new entry, and NO
  `channelType:'scheduler'` message was published to the bus for that task.
