# Spec — SupportRuntime Host

## Capability: Multi-Chat Runtime Host

The `SupportRuntime` is a shared singleton (one per process) that manages N concurrent `SupportChat` instances. It holds shared resources (model client config, provider credentials, extension factories) and enforces bounded memory via idle-chat eviction.

### Scenarios

#### S1: SupportRuntime creates and tracks chats

**GIVEN** a `SupportRuntime` instance
**WHEN** `runtime.createChat(chatId, options)` is called
**THEN** a new `SupportChat` is created and added to the chat registry

**AND** `runtime.getChat(chatId)` returns the chat

**AND** `runtime.chatCount` returns `1`

#### S2: SupportRuntime disposes chats

**GIVEN** a `SupportRuntime` with an active chat
**WHEN** `runtime.disposeChat(chatId)` is called
**THEN** the chat's `dispose()` is called (emitting `session_shutdown`, removing all listeners)

**AND** the chat is removed from the registry

**AND** `runtime.getChat(chatId)` returns `undefined`

#### S3: Chats are isolated from each other

**GIVEN** a `SupportRuntime` with two chats (chatA, chatB) created via `createChat`
**WHEN** a handler is registered on chatA
**THEN** chatB does not receive events emitted by chatA

**AND** a tool registered on chatA is not visible to chatB

#### S4: Shared resources are not duplicated per chat

**GIVEN** a `SupportRuntime` instance
**WHEN** 50 chats are created via `createChat`
**THEN** the runtime holds ONE shared model client config (not 50 copies)

**AND** the runtime holds ONE shared extension factory list (not 50 copies)

#### S5: Idle chats are evicted after TTL

**GIVEN** a `SupportRuntime` with `idleTtlMs: 1000` and an active chat with no activity
**WHEN** 1000ms pass with no prompt on that chat
**THEN** the chat is disposed and removed from the registry

**AND** a `session_shutdown` event was emitted with reason `'quit'`

#### S6: Active chats are not evicted

**GIVEN** a `SupportRuntime` with `idleTtlMs: 1000` and a chat that received a prompt 500ms ago
**WHEN** the eviction sweep runs
**THEN** the chat is NOT disposed (it is still within the idle TTL)

#### S7: Runtime disposes all chats on shutdown

**GIVEN** a `SupportRuntime` with 5 active chats
**WHEN** `runtime.shutdown()` is called
**THEN** all 5 chats are disposed (each emitting `session_shutdown`)

**AND** the chat registry is empty

**AND** `runtime.chatCount` returns `0`

#### S8: Chat limit prevents unbounded growth

**GIVEN** a `SupportRuntime` with `maxChats: 10`
**WHEN** an 11th chat is created via `createChat`
**THEN** the creation is rejected with a descriptive error, OR the oldest idle chat is evicted first to make room

**AND** `runtime.chatCount` never exceeds `10`
