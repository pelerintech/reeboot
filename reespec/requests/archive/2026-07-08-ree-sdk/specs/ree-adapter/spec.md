# Spec — ReeExtensionAdapter

## Capability: Create ReeExtensionAdapter

The `ReeExtensionAdapter` class implements reeboot's `ExtensionAPI` against a `ReeChat`'s event emitter. It is the second `ExtensionAPI` implementer (after `PiExtensionAdapter`) and proves the abstraction is SDK-agnostic. Unlike the pi adapter, it implements **real listener removal** — `on()` returns an unsubscribe that actually removes the handler.

### Scenarios

#### S1: ReeExtensionAdapter implements ExtensionAPI

**GIVEN** `ReeExtensionAdapter` is defined in `reeboot/src/extensions/ree-adapter.ts`
**WHEN** a module imports it
**THEN** it implements `ExtensionAPI` (all required methods present: `registerTool`, `on`, `getAllTools`, `getActiveTools`, `registerCommand`)

**AND** the constructor accepts `(chat: ReeChat, context: ExtensionContext)`

#### S2: registerTool adds to chat tool registry

**GIVEN** a `ReeExtensionAdapter` instance backed by a `ReeChat`
**WHEN** `adapter.registerTool(tool)` is called
**THEN** the tool is added to the chat's tool registry

**AND** a subsequent `adapter.getAllTools()` call returns the tool in its list

#### S3: on() subscribes to chat events with real unsubscribe

**GIVEN** a `ReeExtensionAdapter` instance backed by a `ReeChat`
**WHEN** `const unsub = adapter.on('tool_call', handler)` is called
**THEN** the chat's event emitter has the handler registered

**AND** when the chat emits a `tool_call` event, the handler receives it as a typed `ToolCallEvent` (with `type`, `toolCallId`, `toolName`, `args`)

**AND** calling `unsub()` REMOVES the handler from the chat's emitter — a subsequent emit of `tool_call` does NOT invoke the handler

#### S4: unsubscribe removes only the targeted handler

**GIVEN** two handlers registered on the same event via `adapter.on('turn_end', h1)` and `adapter.on('turn_end', h2)`
**WHEN** the unsubscribe for h1 is called
**THEN** h2 is still registered and receives the next `turn_end` event

**AND** h1 is not invoked

#### S5: on() on a disposed chat throws

**GIVEN** a `ReeExtensionAdapter` instance whose chat has been disposed
**WHEN** `adapter.on('tool_call', handler)` is called
**THEN** it throws a descriptive error indicating the chat is disposed

#### S6: setSessionName / getSessionName operate on chat-local state

**GIVEN** a `ReeExtensionAdapter` instance backed by a `ReeChat`
**WHEN** `adapter.setSessionName('Help desk')` is called, then `adapter.getSessionName()` is called
**THEN** `getSessionName()` returns `'Help desk'`

**AND** the name is stored on the chat (not delegated to pi or any external session)

#### S7: context returns the provided ExtensionContext

**GIVEN** a `ReeExtensionAdapter` constructed with a specific `ExtensionContext`
**WHEN** `adapter.context` is accessed
**THEN** it returns the same `ExtensionContext` instance (reference equality)
