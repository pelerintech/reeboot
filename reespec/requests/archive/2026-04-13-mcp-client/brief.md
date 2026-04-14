# Brief: MCP Client

## Problem

Reeboot has no way to connect to external MCP servers. Users who want to give the agent access to external tools (databases, APIs, SaaS services) have no supported path. The existing quick-win option — `pi-mcp-adapter` — was evaluated and rejected: it hardcodes `~/.pi/agent/` paths, conflicting with reeboot's `~/.reeboot/agent/` agentDir, creating a split configuration story.

## Goal

Add a native MCP client to reeboot that lets users point the agent at any stdio-based MCP server via `config.json`. Tools from configured servers appear to the agent through a single proxy tool, keeping token cost flat regardless of how many servers or tools are configured.

## Approach

A new bundled extension `mcp-manager.ts`, wired into `loader.ts` alongside the existing extensions. Uses `@modelcontextprotocol/sdk` for the MCP protocol. Servers are spawned as child processes on first use (lazy), reused within the session, and killed on `session_shutdown`.

The extension injects a short system prompt snippet listing configured server names and how to use the `mcp` proxy tool. The agent discovers a server's tools by calling `mcp({ action: "list", server: "<name>" })` and invokes them via `mcp({ action: "call", server: "<name>", tool: "<tool>", args: {...} })`.

## Scope

- `mcp-manager.ts` — new bundled extension (~400–500 LOC)
- `config.ts` — new `mcp.servers` schema (~30 LOC)
- `loader.ts` — wire the new extension (~15 LOC)
- `@modelcontextprotocol/sdk` — new dependency (9–12 kB, zod already present)
- Tests (~200–300 LOC)
- No wizard step in v1 — manual config only

## Out of Scope (v1)

- HTTP/SSE transport (stdio only)
- Direct tool registration (proxy-only)
- Wizard setup step
- Cross-session server process sharing
- Permission tiers (roadmap dependency — comes after MCP exists)

## Config Shape

```json
{
  "mcp": {
    "servers": [
      {
        "name": "postgres",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-postgres"],
        "env": { "DATABASE_URL": "postgres://localhost/mydb" }
      }
    ]
  }
}
```

## Key Decisions Made in Discovery

- **Proxy over direct**: single `mcp` tool in context (~200 tokens) rather than registering each MCP tool natively (150–300 tokens each). Agent calls `list` then `call` — one extra step, but token cost stays flat.
- **Lazy startup**: servers are not spawned at session start. First `mcp` tool call for a server triggers spawn + MCP handshake. Process stays alive until session ends.
- **stdio only**: covers ~95% of MCP servers. HTTP/SSE deferred to v2.
- **Manual config**: `~/.reeboot/config.json → mcp.servers[]`. No wizard step in v1.
- **pi-mcp-adapter rejected**: mature community package but hardcodes `~/.pi/agent/` paths — incompatible with reeboot's agentDir without forking.
