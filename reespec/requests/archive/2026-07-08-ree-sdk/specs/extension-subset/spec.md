# Spec — Extension subset runs unchanged on adapter #2

## Capability: Extensions run unchanged through the ReeExtensionAdapter

The ree-relevant extension subset (`observability`, `session-name`, `token-meter`, `capabilities`) runs through `ReeExtensionAdapter` without any modification to the extension files. If an extension file must change, that is evidence the `ExtensionAPI` abstraction leaked — and the fix MUST go in the interface or the adapter, never in the extension. This principle was established by `support-runtime` ("interface-leak detection").

### Scenarios

#### S1: The four extension files are byte-identical to their sdk-pluggability state

**GIVEN** the ree-sdk work is complete
**WHEN** `git diff <sdk-pluggability-commit> -- reeboot/src/extensions/observability.ts reeboot/src/extensions/session-name.ts reeboot/src/extensions/token-meter.ts reeboot/src/extensions/capabilities.ts` is run
**THEN** the diff is empty (no changes to any of the four extension files)

#### S2: observability runs on ReeExtensionAdapter and writes to the DB

**GIVEN** a `ReeChat` + `ReeExtensionAdapter` + in-memory DB, with the observability extension initialized via its factory
**WHEN** `session_shutdown` is emitted on the chat
**THEN** a row exists in the `session_events` table

**AND** when `after_provider_response` is emitted, a row exists in the `rate_limits` table

#### S3: session-name runs on ReeExtensionAdapter

**GIVEN** a `ReeChat` + `ReeExtensionAdapter` with the session-name extension initialized
**WHEN** the session-name command is registered and `setSessionName`/`getSessionName` are called
**THEN** the name is stored and retrieved correctly (operating on chat-local state, not pi)

#### S4: token-meter runs on ReeExtensionAdapter

**GIVEN** a `ReeChat` + `ReeExtensionAdapter` with the token-meter extension initialized
**WHEN** `agent_end` with messages is emitted on the chat
**THEN** the token-meter handler runs without error (reads usage from the event)

#### S5: capabilities runs on ReeExtensionAdapter

**GIVEN** a `ReeChat` + `ReeExtensionAdapter` with tools registered and the capabilities extension initialized (loaded last)
**WHEN** `before_agent_start` is emitted on the chat
**THEN** `getAllTools()` returns the registered tools

**AND** the capabilities handler injects a capabilities block (the system prompt is augmented)

#### S6: Four factories are returned by getReeFactories

**GIVEN** the `getReeFactories(config)` function in `reeboot/src/extensions/loader.ts`
**WHEN** it is called
**THEN** it returns 4 factories (observability, session-name, token-meter, capabilities)

**AND** each factory creates a `ReeExtensionAdapter` for its chat and calls the extension's init function

**AND** no pi `DefaultResourceLoader` is used
