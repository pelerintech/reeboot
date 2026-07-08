# Spec — ReeChat

## Capability: Isolated per-chat state

Each `ReeChat` holds isolated state: a bounded message history, a per-chat tool registry, an `EventEmitter`, and an `AbortController`. State is never shared between chats.

### Scenarios

#### S1: Two chats have independent tool registries

**GIVEN** two `ReeChat` instances (chatA, chatB) each with a `ReeExtensionAdapter`
**WHEN** a tool is registered on chatA's adapter
**THEN** chatB's tool registry is empty

**AND** chatA's `getAllTools()` returns the tool

#### S2: Bounded history enforces FIFO eviction

**GIVEN** a `ReeChat` created with `maxHistory: 5`
**WHEN** 10 messages are appended to the chat's history
**THEN** `chat.history.length` equals 5

**AND** the history contains the 5 most recent messages (the oldest 5 were evicted)

#### S3: AbortController is per-chat, not shared

**GIVEN** two `ReeChat` instances (chatA, chatB)
**WHEN** chatA's `AbortController.abort()` is called
**THEN** chatA's signal is aborted

**AND** chatB's signal is NOT aborted

## Capability: Emits reeboot-shaped events

The `ReeChat` emits events in reeboot-defined shapes (not TanStack-shaped payloads) for every event in `ExtensionEventMap`. The shapes match the fields documented in `extension-api.ts` (the reeboot-owned types).

### Scenarios

#### S4: Each event type is emitted with correct reeboot-defined fields

**GIVEN** a `ReeChat` with registered handlers for each event type
**WHEN** the chat emits `before_agent_start`, `turn_end`, `session_shutdown`, `tool_call`, `tool_result`, `after_provider_response`, `agent_end`
**THEN** each handler receives an object with the correct `type` field

**AND** `turn_end` has `turnId: string`, `sessionId`, `usage?`
**AND** `tool_call` has `toolCallId`, `toolName`, `args`
**AND** `tool_result` has `toolCallId`, `toolName`, `args`, `content`, `isError`
**AND** `session_shutdown` has `sessionId`, `reason`
**AND** `after_provider_response` has `contextId`, `provider`
**AND** `agent_end` has `messages`

#### S5: dispose() removes all listeners and emits session_shutdown

**GIVEN** a `ReeChat` with several handlers registered via its adapter
**WHEN** `chat.dispose()` is called
**THEN** `session_shutdown` is emitted (reason `'quit'`)

**AND** all registered listeners are removed from the emitter (a subsequent emit invokes no handlers)

#### S6: reset() clears history and emits session_shutdown

**GIVEN** a `ReeChat` with messages in its history
**WHEN** `chat.reset()` is called
**THEN** `session_shutdown` is emitted (reason `'new'`)

**AND** `chat.history` is empty

**AND** the chat is reusable (a subsequent prompt works)
