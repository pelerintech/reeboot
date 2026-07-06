# Spec — SupportExtensionAdapter

## Capability: Create SupportExtensionAdapter

The `SupportExtensionAdapter` class implements reeboot's `ExtensionAPI` against a `SupportChat`'s event emitter. It is the second `ExtensionAPI` implementer (after `PiExtensionAdapter`) and proves the abstraction is SDK-agnostic. Unlike the pi adapter, it implements **real listener removal** — `on()` returns an unsubscribe that actually removes the handler.

### Scenarios

#### S1: SupportExtensionAdapter implements ExtensionAPI

**GIVEN** `SupportExtensionAdapter` is defined in `reeboot/src/extensions/support-adapter.ts`
**WHEN** a module imports it
**THEN** it implements `ExtensionAPI` (all required methods present: `registerTool`, `on`, `getAllTools`, `getActiveTools`, `registerCommand`)

**AND** the constructor accepts `(chat: SupportChat, context: ExtensionContext)`

#### S2: registerTool adds to chat tool registry

**GIVEN** a `SupportExtensionAdapter` instance backed by a `SupportChat`
**WHEN** `adapter.registerTool(tool)` is called
**THEN** the tool is added to the chat's tool registry

**AND** a subsequent `adapter.getAllTools()` call returns the tool in its list

#### S3: on() subscribes to chat events with real unsubscribe

**GIVEN** a `SupportExtensionAdapter` instance backed by a `SupportChat`
**WHEN** `const unsub = adapter.on('tool_call', handler)` is called
**THEN** the chat's event emitter has the handler registered

**AND** when the chat emits a `tool_call` event, the handler receives it as a typed `ToolCallEvent` (with `type`, `toolCallId`, `toolName`, `args`)

**AND** calling `unsub()` REMOVES the handler from the chat's emitter — a subsequent emit of `tool_call` does NOT invoke the handler

#### S4: unsubscribe removes only the targeted handler

**GIVEN** two handlers registered on the same event via `adapter.on('turn_end', h1)` and `adapter.on('turn_end', h2)`
**WHEN** the unsubscribe for h1 is called
**THEN** h2 is still registered and receives the next `turn_end` event

**AND** h1 does not receive the next `turn_end` event

#### S5: on() throws descriptive error on disposed chat

**GIVEN** a `SupportChat` that has been disposed
**WHEN** `adapter.on('tool_call', handler)` is called
**THEN** a descriptive error is thrown (not a silent no-op or undefined behaviour)

#### S6: setSessionName / getSessionName operate on chat-local state

**GIVEN** a `SupportExtensionAdapter` instance backed by a `SupportChat`
**WHEN** `adapter.setSessionName('chat-42')` is called
**THEN** `adapter.getSessionName()` returns `'chat-42'`

**AND** the name is scoped to this chat — a different chat's adapter does not see it

#### S7: sendMessage queues a message for the chat

**GIVEN** a `SupportExtensionAdapter` instance backed by a `SupportChat`
**WHEN** `adapter.sendMessage({ customType: 'notify', content: 'hello' })` is called
**THEN** the message is queued on the chat's outgoing message queue

**AND** the chat's `drainOutgoing()` method returns the message

#### S8: context is provided and chat-scoped

**GIVEN** a `SupportExtensionAdapter` created with `context: ExtensionContext`
**WHEN** an extension accesses `adapter.context`
**THEN** it receives the `ExtensionContext` (workspacePath, config, db, scheduler, cwd, ui, hasUI)

**AND** `context.cwd` and `context.workspacePath` reflect the chat's working directory, not a global default

#### S9: all handlers removed on chat dispose

**GIVEN** a `SupportChat` with multiple handlers registered via its adapter (`on('tool_call', h1)`, `on('turn_end', h2)`, `on('session_shutdown', h3)`)
**WHEN** `chat.dispose()` is called
**THEN** all handlers are removed from the emitter

**AND** the emitter has zero listeners for every event

**AND** `session_shutdown` IS emitted before the listeners are removed (so h3 fires)
