# Spec: Violation Logging

Structured logging when MCP server calls are blocked by the OS sandbox.

---

## Capability: Permission violations logged at warn level

**GIVEN** an MCP server call that returns an OS-level error (EPERM, EACCES, connection refused)  
**AND** `permissions.violations.log` is `true` (default)  
**WHEN** the error is received in `mcp-manager.ts`  
**THEN** a structured log entry is emitted at `warn` level with fields:  
  `event: 'mcp_permission_violation'`, `server`, `tool`, `error`, `permissions`

---

## Capability: Violation logging disabled by config

**GIVEN** `config.permissions.violations.log` is `false`  
**WHEN** an MCP server call returns an OS-level error  
**THEN** no violation log entry is emitted  
**AND** the error is still returned to the agent as a tool call failure

---

## Capability: Non-violation errors are not logged as violations

**GIVEN** an MCP server call that fails for a non-OS-sandbox reason (server process crash, invalid tool name)  
**WHEN** the error is received  
**THEN** no `mcp_permission_violation` log entry is emitted  
**AND** the error is returned to the agent normally
