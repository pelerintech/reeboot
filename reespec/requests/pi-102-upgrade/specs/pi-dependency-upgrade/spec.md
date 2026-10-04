# Capability: pi dependency upgrade

The pi runtime is upgraded from `0.84.1` to `1.0.2` and reeboot's pi-ai / pi-agent-core exceed
placement is reconciled to match. Reeboot's pi-mode integration keeps working against the new SDK.

## Scenarios

### pi and companions are upgraded to 1.0.2

GIVEN reeboot pins the pi runtime at `0.84.1`
WHEN the dependency task completes
THEN `reeboot/package.json` declares `@earendil-works/pi-coding-agent` at exact `1.0.2`
AND `@earendil-works/pi-ai` is at exact `1.0.2`
AND `@earendil-works/pi-agent-core` is at exact `1.0.2`.

### The resolved pi tree lands on 1.0.2

GIVEN the dependency files are updated
WHEN `npm install` runs and the package tree is inspected
THEN `npm ls @earendil-works/pi-coding-agent` resolves to `1.0.2`
AND `npm ls @earendil-works/pi-ai` resolves to `1.0.2`
AND `npm ls @earendil-works/pi-agent-core` resolves to `1.0.2`.

### Pi mode still builds a session in both auth modes

GIVEN the pi SDK surface changed across the major bump (0.84 → 1.0)
WHEN a `PiAgentRunner` is driven in `authMode === 'own'`
THEN it calls `createAgentSession` with `model`/`modelRuntime`/`settingsManager`/`resourceLoader`/
    `sessionManager`/`cwd` as before
AND in `authMode === 'pi'` it passes `agentDir` and lets `createAgentSession` default its runtime.

### Pi mode maps session events correctly

GIVEN a running `PiAgentRunner` session
WHEN stream events arrive
THEN `message_update` → `text_delta` (via `assistantMessageEvent.delta`)
AND `tool_execution_start`/`tool_execution_end` map `toolCallId`/`toolName`/`result`/`isError`
AND `agent_end` → `message_end` with usage derived from the last assistant message.

### Pi mode keeps working against the configured model

GIVEN the migration lands and the pi runtime is on `1.0.2`
WHEN an OpenAI-compatible provider is configured with a `baseUrl`
THEN `buildModelFromConfig` yields a Model carrying that `baseUrl`
AND a real turn completes (no contract error from the new SDK).

### No new built-in extensions leak into reeboot's tool surface

GIVEN pi 0.99+ introduced built-in extensions (codemode / mcp / tool-search / llama.cpp)
WHEN a pi session starts via reeboot's `createLoader`
THEN the session's active tool set is limited to reeboot's own registered factories
AND no codemode / tool-search / llama.cpp tool appears that reeboot did not explicitly enable.

### Typecheck and build remain green

GIVEN the SDK surface changed across the major bump
WHEN the migration lands
THEN `npm run build` succeeds AND `tsc --noEmit` reports no errors.
