# Spec — Extension Subset on Second Adapter

## Capability: Extensions Run Unchanged Through SupportExtensionAdapter

Four support-relevant extensions (observability, session-name, token-meter, capabilities) run through the `SupportExtensionAdapter` without modification. This proves the `ExtensionAPI` abstraction is genuine — the same extension code that runs on `PiExtensionAdapter` runs on `SupportExtensionAdapter`. If any extension requires changes, that is evidence the abstraction leaked and must be fixed in the interface, not the extension.

### Scenarios

#### S1: observability runs on the support adapter

**GIVEN** the `observability` extension factory (`makeObservabilityExtension`) and a `SupportExtensionAdapter` backed by a `SupportChat`
**WHEN** `makeObservabilityExtension(adapter, db, opts)` is called
**THEN** the extension registers `session_shutdown` and `after_provider_response` handlers without error

**AND** when the chat emits `session_shutdown`, a row is inserted into the `session_events` DB table

**AND** when the chat emits `after_provider_response`, a row is inserted into the `rate_limits` DB table

**AND** no changes were made to `observability.ts` (the file is identical to its state in the `sdk-pluggability` request)

#### S2: session-name runs on the support adapter

**GIVEN** the `session-name` extension factory and a `SupportExtensionAdapter`
**WHEN** the extension is initialized
**THEN** it registers a `session-name` command via `adapter.registerCommand`

**AND** `adapter.setSessionName()` and `adapter.getSessionName()` work (the optional methods are implemented on the support adapter)

**AND** no changes were made to `session-name.ts`

#### S3: token-meter runs on the support adapter

**GIVEN** the `token-meter` extension factory and a `SupportExtensionAdapter`
**WHEN** the extension is initialized
**THEN** it registers an `agent_end` handler without error

**AND** when the chat emits `agent_end`, the handler processes the messages array without error

**AND** no changes were made to `token-meter.ts`

#### S4: capabilities runs on the support adapter

**GIVEN** the `capabilities` extension factory and a `SupportExtensionAdapter` with tools registered
**WHEN** the extension is initialized
**THEN** it registers a `before_agent_start` handler

**AND** `adapter.getAllTools()` returns the registered tools

**AND** when the chat emits `before_agent_start`, the handler injects a capabilities block into the system prompt

**AND** no changes were made to `capabilities.ts`

#### S5: All four extensions load without pi SDK imports

**GIVEN** the four extension files (observability.ts, session-name.ts, token-meter.ts, capabilities.ts)
**WHEN** grep is run for pi SDK imports
**THEN** none of the four files contain `from '@earendil-works/pi-coding-agent'`

**AND** all four import `ExtensionAPI` from `./extension-api.js` (already verified in sdk-pluggability)

#### S6: Extension files are byte-identical to sdk-pluggability state

**GIVEN** the four extension files after the support-runtime request is complete
**WHEN** compared to their state at the end of the sdk-pluggability request
**THEN** none of the four files were modified (git diff shows no changes)

**AND** if any file WAS modified, the design's assertion that "extensions run unchanged" is violated and the interface must be fixed instead
