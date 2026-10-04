# Capability: ree strict-mode fix

Reeboot's ree-mode tool emission no longer forces reeboot tools with genuinely-optional params
into OpenAI `strict:true`, so OpenAI-compatible providers (OpenRouter/OpenAI) accept them. The
fix lives in the integration layer; reeboot's shared tool schemas stay SDK-agnostic and pi mode
is unaffected.

## Scenarios

### Optional-param reeboot tools are emitted non-strict in ree mode

GIVEN a reeboot tool whose schema has a property not listed in `required` (e.g. `session_search`
with optional `limit`, or `delegate` with optional `peer`/`timeout`)
WHEN ree mode emits that tool to an OpenAI-compatible provider
THEN the tool is sent with `strict:false`
AND its `parameters` retain the optional property as optional (not moved into `required`, not
    null-widened).

### Fully-required tools may still use strict mode

GIVEN a tool whose parameters are all in `required`
WHEN ree mode emits that tool
THEN it is sent with `strict:true` (strict mode preserved for strict-compatible tools).

### The shared tool schemas are unchanged

GIVEN the strict-mode fix lands
WHEN the reeboot `ToolDefinition`s for `session_search` and `delegate` are inspected
THEN their `parameters` are identical to before the fix (optional props remain optional, no forced
    `required`), preserving SDK-agnosticism.

### Pi mode keeps its correct strict emission

GIVEN the strict-mode fix lands (ree-mode only)
WHEN pi mode emits the same `session_search`/`delegate` tools
THEN they are still sent with `strict:false` and optional params respected (no regression).

### A collection turn completes against an OpenAI-compatible provider

GIVEN reeboot runs in ree mode with the incohub config against an OpenAI-compatible provider
WHEN the `register-company` collection conversation runs
THEN the turn completes (no `400` strict-schema rejection)
AND the agent performs at least one schema-driven collection tool call (`set_field`/
    `add_group_item`/`set_choice`/`set_doc`).
