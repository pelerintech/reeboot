# Capability: extension bridge & event stream

Reeboot's extension surface and event mapping keep working against the `0.84` SDK: the
`PiExtensionAdapter` bridge (`src/extensions/pi-adapter.ts`) remains compatible, the stream-event
mapping in `pi-runner.ts` still consumes the `0.84` events, and the owner-only `restricted` gating
is unaffected.

## Scenarios

### The event stream mapping stays intact

GIVEN a PiAgentRunner maps pi events to `RunnerEvent`
WHEN the migration lands
THEN `message_update` (text_delta) → `text_delta`, `tool_execution_start` → `tool_call_start`,
`tool_execution_end` → `tool_call_end`, and `agent_end` → `message_end` still work
AND the tool-scanning / view-propagation tests that drive these events pass.

### PiExtensionAdapter validates against the 0.84 ExtensionAPI

GIVEN reeboot's extensions sit on `PiExtensionAdapter implements ExtensionAPI`
WHEN the migration lands
THEN the adapter compiles against the `0.84` ExtensionAPI
AND the bundled extensions (confirm-destructive, memory, knowledge, web, etc.) still register
and run through the adapter.

### restricted gating is preserved

GIVEN remote/restricted turns run with `ContextConfig.restricted: true`
WHEN the runner creates the session and extensions run
THEN owner-only mutation tools (memory write, knowledge ingest) are still skipped for restricted
runners exactly as before the upgrade.

### generateSummary / loadProjectContextFiles still resolve

GIVEN `custom-compaction.ts` and `doctor.ts` import `generateSummary` and `loadProjectContextFiles` from pi
WHEN the migration lands
THEN both symbols still resolve from the `0.84` package exports and their consumers compile.
