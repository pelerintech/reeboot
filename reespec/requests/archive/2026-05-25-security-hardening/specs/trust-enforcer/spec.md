# Spec — trust-enforcer

The `trust-enforcer` extension enforces tool whitelists for `end-user` trust sessions. It replaces the non-functional `_toolCallGuard` approach in `pi-runner.ts` that only worked in tests.

## Scenarios

### 1. Blocks disallowed tool for end-user session

**GIVEN** the current session trust is `end-user`
**AND** the context has `tools: { whitelist: ["web_search", "fetch_url", "knowledge_search"] }`
**WHEN** the agent attempts to call the `bash` tool
**THEN** the `tool_call` event handler returns `{ block: true, reason: 'Tool "bash" is not available in this context' }`

### 2. Allows whitelisted tool for end-user session

**GIVEN** the current session trust is `end-user`
**AND** the context has `tools: { whitelist: ["web_search", "fetch_url"] }`
**WHEN** the agent attempts to call the `web_search` tool
**THEN** the `tool_call` event handler returns `undefined` (tool proceeds normally)

### 3. Allows all tools when no whitelist is configured

**GIVEN** the current session trust is `end-user`
**AND** the context has no `tools.whitelist` (or empty whitelist)
**WHEN** the agent attempts to call ANY tool
**THEN** the `tool_call` event handler returns `undefined` — no restriction (whitelist is opt-in)

### 4. Allows all tools for owner trust

**GIVEN** the current session trust is `owner`
**WHEN** the agent attempts to call ANY tool
**THEN** the `tool_call` event handler returns `undefined` — trust-enforcer is a no-op for owners

### 5. Logs violation to operational_logs

**GIVEN** the current session trust is `end-user`
**AND** `permissions.violations.log` is `true` (default)
**AND** the agent attempts to call a blocked tool
**WHEN** the `tool_call` event handler blocks the call
**THEN** a log entry is written to `operational_logs` via `getLogger().warn()` with component `trust-enforcer` and fields `{ event: 'trust_violation', toolName, trust: 'end-user' }`

### 6. Does not log violation when logging disabled

**GIVEN** the current session trust is `end-user`
**AND** `permissions.violations.log` is `false`
**AND** the agent attempts to call a blocked tool
**WHEN** the `tool_call` event handler blocks the call
**THEN** no log entry is written

### 7. Reads trust level from workspace meta file

**GIVEN** the workspace meta file `~/.reeboot/contexts/<contextId>/workspace/.reeboot_turn_meta.json` contains `{ "trust": "end-user", "operationType": "user_message", "turnId": "abc123" }`
**WHEN** the agent calls any tool
**THEN** the trust-enforcer reads `trust: "end-user"` from the meta file and applies end-user restrictions

### 8. Defaults to owner when meta file is absent

**GIVEN** the workspace meta file does not exist (e.g., first turn, or non-orchestrator invocation)
**WHEN** the agent calls any tool
**THEN** the trust-enforcer treats trust as `owner` and allows all tools