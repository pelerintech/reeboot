# Spec — PiExtensionAdapter

## Capability: Create PiExtensionAdapter

The `PiExtensionAdapter` class bridges pi SDK to reeboot's `ExtensionAPI`. It maps pi events to reeboot's typed events and forwards method calls.

### Scenarios

#### S1: PiExtensionAdapter implements ExtensionAPI

**GIVEN** `PiExtensionAdapter` is defined in `reeboot/src/extensions/pi-adapter.ts`  
**WHEN** a module imports it  
**THEN** it implements `ExtensionAPI` (all required methods are present)

#### S2: registerTool forwards to pi

**GIVEN** a `PiExtensionAdapter` instance with a pi session  
**WHEN** `adapter.registerTool(tool)` is called  
**THEN** `pi.registerTool(tool)` is called on the underlying pi session

#### S3: on() maps events to pi

**GIVEN** a `PiExtensionAdapter` instance with a pi session  
**WHEN** `adapter.on('before_agent_start', handler)` is called  
**THEN** `pi.on('before_agent_start', ...)` is called on the underlying pi session

**AND** when pi fires the event, the handler receives a typed `BeforeAgentStartEvent`

#### S4: on() returns unsubscribe function

**GIVEN** a `PiExtensionAdapter` instance with a pi session  
**WHEN** `const unsubscribe = adapter.on('tool_call', handler)` is called  
**THEN** `unsubscribe` is a callable function (conforms to the `ExtensionAPI` contract)

**AND** because pi's `on()` returns `void` (no native per-handler unsubscribe), the pi adapter returns a documented no-op unsubscribe — this is a known pi limitation, not a contract violation by the adapter

**AND** the adapter tracks registered handlers internally (e.g. a `_handlers` map) so a future pi version or a wrapper could remove them

**NOTE:** the `ExtensionAPI` contract requires `on()` to return an unsubscribe function. Future SDK adapters (e.g. `SupportExtensionAdapter`) MUST implement real listener removal — listener leaks are unacceptable at multi-chat scale where chats churn constantly.

#### S5: setSessionName forwards to pi

**GIVEN** a `PiExtensionAdapter` instance with a pi session that supports session naming  
**WHEN** `adapter.setSessionName('my-session')` is called  
**THEN** the underlying pi session's session name is set to 'my-session'

#### S6: getSessionName retrieves from pi

**GIVEN** a `PiExtensionAdapter` instance with a pi session  
**WHEN** `adapter.getSessionName()` is called  
**THEN** it returns the current session name from the pi session

#### S7: sendMessage forwards to pi

**GIVEN** a `PiExtensionAdapter` instance with a pi session  
**WHEN** `adapter.sendMessage(message, options)` is called  
**THEN** `pi.sendMessage(message, options)` is called on the underlying pi session

#### S8: context is provided

**GIVEN** a `PiExtensionAdapter` instance created with `context: ExtensionContext`  
**WHEN** an extension accesses `adapter.context`  
**THEN** it receives the same `ExtensionContext` object (workspacePath, config, db, scheduler)

#### S9: Event payload transformation

**GIVEN** a `PiExtensionAdapter` instance  
**WHEN** pi fires a `tool_call` event with pi's native payload format  
**THEN** the handler receives a properly typed `ToolCallEvent` (with `type`, `toolCallId`, `toolName`, `args`)

**AND** for pass-through events (events where pi and reeboot define identical shapes), all pi fields are preserved (no data loss)

**AND** for transformed events (`turn_end`, `tool_result`, `session_shutdown`, `after_provider_response`), the adapter maps pi fields to reeboot's SDK-agnostic shape; pi-specific extra fields are intentionally NOT preserved (they are SDK-specific and have no meaning in a reeboot-defined event). This is by design — a future SDK adapter transforms its own SDK fields to the same reeboot shape.

#### S10: Adapter can be instantiated without pi session

**GIVEN** no pi session is available (e.g., in tests)  
**WHEN** `new PiExtensionAdapter(null, context)` is called  
**THEN** the adapter is created successfully

**AND** calls to `registerTool()`, `on()`, etc. are no-ops or throw descriptive errors
