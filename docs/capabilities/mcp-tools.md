---
title: "MCP Tools"
description: "Connect any MCP-compatible tool server to reeboot via stdio and the mcp proxy tool."
---

# MCP Tools

Reeboot supports the [Model Context Protocol](https://modelcontextprotocol.io) (MCP) for connecting external tool servers. Any MCP-compatible server can be wired in via configuration — no code changes required.

MCP is enabled by default (`extensions.core.mcp: true`) but requires at least one server in `mcp.servers` to be useful.

---

## How It Works — The Proxy Pattern

Rather than registering each MCP server's tools directly (which costs 150–300 tokens per tool in the system prompt), reeboot exposes a single `mcp` proxy tool (~200 tokens total).

The agent uses it in two steps:

**Step 1 — Discover tools:**
```
mcp({ action: "list", server: "filesystem" })
→ [{ name: "read_file", description: "...", schema: {...} }, ...]
```

**Step 2 — Call a tool:**
```
mcp({ action: "call", server: "filesystem", tool: "read_file", input: { path: "/tmp/data.csv" } })
→ { content: "..." }
```

This keeps token cost fixed regardless of how many tools each server exposes.

---

## Configuration

Add servers to `mcp.servers[]` in `~/.reeboot/config.json`:

```json
{
  "mcp": {
    "servers": [
      {
        "name": "filesystem",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/documents"],
        "env": {},
        "permissions": {
          "network": false,
          "filesystem": true
        }
      },
      {
        "name": "github",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": { "GITHUB_TOKEN": "ghp_..." },
        "permissions": {
          "network": true,
          "filesystem": false
        }
      }
    ]
  }
}
```

---

## Server Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✅ | Unique identifier used in `mcp({ server: "name" })` calls. |
| `command` | string | ✅ | Executable to spawn (e.g. `"npx"`, `"python"`, `"/usr/local/bin/my-server"`). |
| `args` | string[] | | Arguments passed to the command. |
| `env` | object | | Environment variables set for the server process. Useful for API keys. |
| `permissions.network` | boolean | | Allow the server process to make outbound network requests. Default: `false`. |
| `permissions.filesystem` | boolean | | Allow the server process filesystem access. Default: `false`. |

---

## Lifecycle

Servers are **lazy-started** — spawned as child processes on the first `mcp` tool call, not at agent startup. They are killed on `session_shutdown`.

---

## Limitations (v1)

- **stdio only** — HTTP and SSE transports are not supported in v1.
- **Manual config** — no wizard setup step; servers must be added to config.json manually.
- **No hot-reload** — restart reeboot after adding or changing MCP servers.

---

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `mcp.servers` | array | `[]` | List of MCP server definitions. |
| `extensions.core.mcp` | boolean | `true` | Enable/disable the `mcp` proxy tool entirely. |
