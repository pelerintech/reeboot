# Design: MCP Client

## Overview

A new bundled extension `mcp-manager.ts` that connects reeboot to stdio-based MCP servers. Config lives in `~/.reeboot/config.json → mcp.servers[]`. The agent interacts with all MCP servers through a single proxy tool called `mcp`.

---

## Component Map

```
config.json
  └── mcp.servers[{ name, command, args, env }]
          │
          ▼
    loader.ts (getBundledFactories)
          │
          ▼
    mcp-manager.ts  (ExtensionFactory)
          │
          ├── on('before_agent_start')  → inject system prompt snippet
          ├── on('session_shutdown')    → kill all child processes
          └── registerTool('mcp')      → proxy tool
                    │
                    ├── action: "list"
                    │       └── McpServerPool.connect(name)
                    │               └── spawn subprocess (stdio)
                    │               └── MCP handshake (initialize)
                    │               └── tools/list request
                    │               └── return tool descriptors
                    │
                    └── action: "call"
                            └── McpServerPool.getOrConnect(name)
                            └── tools/call request
                            └── return result content
```

---

## Key Classes

### `McpServerPool`

Manages the lifecycle of all MCP server processes within a session.

```
McpServerPool
  _clients: Map<name, { client: Client, connected: boolean }>

  getOrConnect(name)  → returns existing client or spawns+connects
  connect(name)       → spawn subprocess, initialize MCP, cache client
  disconnectAll()     → kill all subprocesses (called on session_shutdown)
```

### Extension function: `mcpManagerExtension(pi, config)`

Follows the same signature pattern as `skillManagerExtension` and `webSearchExtension`.

---

## The `mcp` Proxy Tool

Single tool registered via `pi.registerTool()`.

**Parameters:**
```ts
{
  action: "list" | "call",
  server: string,
  tool?: string,       // required when action = "call"
  args?: object        // passed through to MCP server
}
```

**`list` response:** JSON array of `{ name, description, inputSchema }` for each tool the server exposes.

**`call` response:** The MCP tool result content array, serialised to text.

**Error cases returned as text (not thrown):**
- Unknown server name → `"Unknown MCP server: <name>. Configured servers: [...]"`
- Spawn failure → `"Failed to start MCP server <name>: <error>"`
- Tool not found → passed through from MCP server's error response

---

## System Prompt Injection

On `before_agent_start`, if `mcp.servers` is non-empty:

```
<mcp_servers>
You have access to MCP servers via the `mcp` tool.

Configured servers: postgres, github

Usage:
  List tools:  mcp({ action: "list", server: "postgres" })
  Call a tool: mcp({ action: "call", server: "postgres", tool: "query", args: { sql: "SELECT 1" } })
</mcp_servers>
```

If no servers configured: nothing injected.

---

## Config Schema Addition

```ts
// config.ts
const McpServerSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
});

const McpConfigSchema = z.object({
  servers: z.array(McpServerSchema).default([]),
});

// Added to ConfigSchema:
mcp: McpConfigSchema.default({})
```

---

## Loader Wiring

Toggle: `config.extensions.core.mcp` (default: `true`). Wired in `getBundledFactories` alongside web-search and skill-manager.

---

## Subprocess Lifecycle

```
First mcp({ action: "list", server: "postgres" })
  → spawn: npx -y @modelcontextprotocol/server-postgres (with env)
  → MCP initialize handshake
  → cache client in McpServerPool

Subsequent calls to same server
  → reuse cached client (no re-spawn)

session_shutdown event
  → McpServerPool.disconnectAll()
  → all child processes killed
```

No idle timeout in v1. Processes live for the full session duration.

---

## Dependency

`@modelcontextprotocol/sdk` added to `dependencies` in `package.json`.
Uses `Client` + `StdioClientTransport` from that SDK.
Zod is already present — no new peer deps.

---

## Risks

| Risk | Mitigation |
|---|---|
| MCP server crashes mid-session | Tool call returns error text; next call re-connects |
| Server takes long to start (npx) | Inherits pi's turn timeout (default 5 min) |
| Bad command in config | Spawn error caught, returned as text error |
| Server emits to stderr | Pipe ignored (not surfaced to agent) |
| Server never completes handshake | SDK's connect() will reject; caught and returned as error |

---

## Out of Scope (v1)

- HTTP/SSE transport
- Direct tool registration (no per-tool `registerTool` calls)
- Idle timeout / auto-disconnect
- Cross-session process sharing
- Wizard setup step
- Permission tiers on MCP tools
