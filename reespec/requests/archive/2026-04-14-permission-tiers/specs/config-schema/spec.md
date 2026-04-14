# Spec: Config Schema

Extensions to `config.ts` for permission declarations.

---

## Capability: MCP server accepts permissions field

**GIVEN** a `config.json` with an MCP server entry containing a `permissions` object  
**WHEN** `loadConfig()` parses it  
**THEN** the parsed config has `mcp.servers[0].permissions.network` and `mcp.servers[0].permissions.filesystem` matching the declared values

---

## Capability: MCP server permissions default to deny-all

**GIVEN** a `config.json` with an MCP server entry that has no `permissions` field  
**WHEN** `loadConfig()` parses it  
**THEN** `mcp.servers[0].permissions.network` is `false` and `mcp.servers[0].permissions.filesystem` is `false`

---

## Capability: Top-level permissions block

**GIVEN** a `config.json` with a top-level `permissions` object  
**WHEN** `loadConfig()` parses it  
**THEN** `config.permissions.violations.log` reflects the declared value

---

## Capability: Violations logging defaults to true

**GIVEN** a `config.json` with no `permissions` field  
**WHEN** `loadConfig()` parses it  
**THEN** `config.permissions.violations.log` is `true`
