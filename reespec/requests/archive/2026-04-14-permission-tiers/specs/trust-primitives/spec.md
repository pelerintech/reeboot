# Spec: Trust Primitives

Shared types and defaults for the permission tier system. Designed to be extended by the channel-trust request (R2a).

---

## Capability: TrustLevel enum

**GIVEN** the `src/trust.ts` module exists  
**WHEN** imported  
**THEN** it exports a `TrustLevel` object with values `builtin`, `mcp`, and `skill`

---

## Capability: McpPermissions type and defaults

**GIVEN** `src/trust.ts` exports `McpPermissions` and `MCP_DEFAULTS`  
**WHEN** `MCP_DEFAULTS` is inspected  
**THEN** `network` is `false` and `filesystem` is `false`

---

## Capability: McpPermissions are default-deny

**GIVEN** an MCP server config with no `permissions` field  
**WHEN** the config is parsed  
**THEN** the server's permissions resolve to `MCP_DEFAULTS` (both `network` and `filesystem` false)
