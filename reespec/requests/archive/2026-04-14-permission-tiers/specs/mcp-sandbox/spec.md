# Spec: MCP Sandbox

Sandbox profile selection and subprocess wrapping at MCP server spawn time.

---

## Capability: Sandbox-wrapped spawn when sandbox tool available

**GIVEN** an MCP server configured with default-deny permissions  
**AND** `sandbox-exec` (macOS) or `bwrap` (Linux) is available on PATH  
**WHEN** `McpServerPool.getOrConnect()` spawns the server  
**THEN** the subprocess command is wrapped with the OS sandbox tool using the restricted profile

---

## Capability: Network-enabled spawn uses permissive profile

**GIVEN** an MCP server configured with `permissions.network: true`  
**AND** the OS sandbox tool is available  
**WHEN** `McpServerPool.getOrConnect()` spawns the server  
**THEN** the subprocess is wrapped with the network-permissive sandbox profile

---

## Capability: Filesystem-enabled spawn uses read-only profile

**GIVEN** an MCP server configured with `permissions.filesystem: true`  
**AND** the OS sandbox tool is available  
**WHEN** `McpServerPool.getOrConnect()` spawns the server  
**THEN** the subprocess is wrapped with the filesystem-read-only sandbox profile

---

## Capability: Graceful fallback when sandbox unavailable

**GIVEN** an MCP server with default-deny permissions  
**AND** neither `sandbox-exec` nor `bwrap` is available on PATH  
**WHEN** `McpServerPool.getOrConnect()` spawns the server  
**THEN** the server spawns without sandboxing and a warning is logged (`sandbox unavailable for MCP server <name>`)  
**AND** startup does not fail

---

## Capability: Sandbox profiles exist on disk

**GIVEN** the reeboot package is installed  
**WHEN** the sandbox profile paths are resolved  
**THEN** `mcp-restricted.sb` and `mcp-network.sb` exist in the sandbox extensions directory
