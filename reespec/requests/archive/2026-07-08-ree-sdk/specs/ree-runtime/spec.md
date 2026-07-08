# Spec — ReeRuntime

## Capability: Multi-chat host with bounded memory

The `ReeRuntime` is a shared singleton that hosts N concurrent `ReeChat`s in one process. It creates, tracks, and disposes chats, and enforces bounded memory via idle eviction and a chat-count limit.

### Scenarios

#### S1: createChat creates and tracks a chat

**GIVEN** a `ReeRuntime` instance
**WHEN** `runtime.createChat('c1', {})` is called
**THEN** `runtime.getChat('c1')` returns a `ReeChat`

**AND** `runtime.chatCount` equals 1

#### S2: disposeChat removes a chat

**GIVEN** a `ReeRuntime` with a chat `c1`
**WHEN** `runtime.disposeChat('c1')` is called
**THEN** `runtime.getChat('c1')` returns undefined

**AND** `runtime.chatCount` equals 0

**AND** the chat's `dispose()` was called (listeners removed, session_shutdown emitted)

#### S3: Chat isolation — events on one chat do not reach another

**GIVEN** two `ReeChat`s (chatA, chatB) created by the same runtime
**WHEN** a handler is registered on chatA and an event is emitted on chatA
**THEN** chatB's handler (if any) is NOT invoked

#### S4: Shared config — all chats share one config object

**GIVEN** a `ReeRuntime` with 50 chats created
**WHEN** the config references on each chat are compared
**THEN** they are the same object (reference equality), not 50 copies

#### S5: Idle eviction disposes chats past TTL

**GIVEN** a `ReeRuntime` with `idleTtlMs: 50` and one chat that has been idle for 80ms
**WHEN** `runtime.sweepIdle()` is called
**THEN** the chat is disposed and removed from the registry

**AND** `runtime.chatCount` equals 0

#### S6: maxChats cap enforced

**GIVEN** a `ReeRuntime` with `maxChats: 2` and 2 active chats
**WHEN** a 3rd chat is created
**THEN** the runtime either evicts the oldest idle chat OR throws

**AND** `runtime.chatCount` never exceeds 2

#### S7: shutdown() disposes all chats

**GIVEN** a `ReeRuntime` with 3 active chats
**WHEN** `runtime.shutdown()` is called
**THEN** all 3 chats are disposed (each emitted `session_shutdown`)

**AND** `runtime.chatCount` equals 0
