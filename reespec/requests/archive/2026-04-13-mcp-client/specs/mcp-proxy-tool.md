# Spec: MCP Proxy Tool

## Capability
A single `mcp` tool is registered with pi. It accepts `action`, `server`, `tool`, and `args` parameters and routes to the appropriate MCP server process.

---

## Scenarios

### Tool registration

#### GIVEN mcp-manager is initialised with any config (even empty servers)
WHEN the extension factory runs
THEN pi.registerTool is called exactly once with name "mcp"

---

### action: "list"

#### GIVEN server "postgres" is configured and not yet started
WHEN the agent calls mcp({ action: "list", server: "postgres" })
THEN the extension spawns the postgres subprocess
AND performs the MCP initialize handshake
AND calls tools/list
AND returns a JSON array of tool descriptors ({ name, description })

#### GIVEN server "postgres" is already running (second list call)
WHEN the agent calls mcp({ action: "list", server: "postgres" }) again
THEN no new subprocess is spawned
AND the tool descriptors are returned from the existing connection

#### GIVEN server "unknown" is not in config
WHEN the agent calls mcp({ action: "list", server: "unknown" })
THEN the tool returns an error message containing "Unknown MCP server: unknown"
AND lists the configured server names in the error

---

### action: "call"

#### GIVEN server "postgres" is configured and running, tool "query" exists
WHEN the agent calls mcp({ action: "call", server: "postgres", tool: "query", args: { sql: "SELECT 1" } })
THEN the extension sends a tools/call request to the MCP server
AND returns the result content as text

#### GIVEN server "postgres" is configured but not yet started
WHEN the agent calls mcp({ action: "call", server: "postgres", tool: "query", args: {} })
THEN the extension spawns the server first (lazy connect)
AND then executes the tool call
AND returns the result

#### GIVEN server "unknown" is not in config
WHEN the agent calls mcp({ action: "call", server: "unknown", tool: "anything" })
THEN the tool returns an error message containing "Unknown MCP server: unknown"

---

### Spawn failure

#### GIVEN a server with an invalid command ("not-a-real-binary")
WHEN the agent calls mcp({ action: "list", server: "badserver" })
THEN the tool returns an error message containing "Failed to start MCP server"
AND does not throw (error is returned as text content)

---

### session_shutdown

#### GIVEN two MCP servers are connected
WHEN session_shutdown fires
THEN both subprocess connections are closed
AND McpServerPool has no active clients
