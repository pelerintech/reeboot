---
title: "Sandbox"
description: "OS-level confinement for bash tool execution on macOS and Linux."
---

# Sandbox

When the agent runs bash commands, reeboot wraps the execution in OS-level sandboxing to limit what those commands can access. This is enabled by default.

---

## How It Works

| Platform | Mechanism |
|---|---|
| macOS | `sandbox-exec` with a restrictive profile |
| Linux | `bwrap` (bubblewrap) with namespace isolation |

The sandbox restricts filesystem access, network access, and process capabilities. Commands that the agent runs cannot reach outside the permitted scope even if the agent is manipulated into running malicious commands.

---

## Configuration

```json
{
  "sandbox": { "mode": "os" }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `sandbox.mode` | `"os"` \| `"docker"` | `"os"` | Sandboxing mechanism. `"os"` uses the native OS sandbox tool. `"docker"` is planned. |
| `extensions.core.sandbox` | boolean | `true` | Enable or disable sandboxing entirely. |

---

## What Is and Isn't Sandboxed

The sandbox applies to **bash tool execution** and **MCP server processes**. It does not wrap the reeboot process itself or other Node.js operations.

### Bash tool execution

Bash commands run by the agent are wrapped via `@anthropic-ai/sandbox-runtime`. The default policy:

| Category | Permitted | Denied |
|---|---|---|
| Filesystem reads | ✅ System libraries, executables, project directory | ❌ `~/.ssh`, `~/.aws`, `.env` by default |
| Filesystem writes | ✅ Current working directory, `/tmp` | ❌ Paths outside allowed set |
| Network | Configurable per-domain allowlist | ❌ All outbound by default |
| Process operations | ✅ `exec`, `fork`, signals | — |

Network and filesystem rules can be customised via a `sandbox.json` config:

```json
// .pi/sandbox.json (project-local) or ~/.pi/agent/sandbox.json (global)
{
  "network": {
    "allowedDomains": ["github.com", "*.github.com"]
  },
  "filesystem": {
    "allowWrite": [".", "/tmp"],
    "denyRead": ["~/.ssh", "~/.aws"]
  }
}
```

### MCP server processes

MCP servers are sandboxed using a separate profile driven by their `permissions` config:

| Permission | Profile | Network outbound | Filesystem writes |
|---|---|---|---|
| `{ network: false, filesystem: false }` | `mcp-restricted` | ❌ Denied | ❌ `/tmp` only |
| `{ network: true, filesystem: false }` | `mcp-network` | ✅ Allowed | ❌ `/tmp` only |

Filesystem reads are always allowed for MCP servers (required for system libraries).

### Not sandboxed

- The reeboot Node.js process itself
- Network calls made by reeboot's own code (channel connections, LLM API calls)
- Files written directly by the agent via reeboot's built-in file tools (protected separately by `protected_paths`)

---

## Disabling the Sandbox

```json
{
  "extensions": {
    "core": { "sandbox": false }
  }
}
```

> **Warning**: disabling the sandbox removes the isolation layer between the agent and your system. Only do this if you understand the implications.

---

## Requirements

- **macOS**: `sandbox-exec` is available by default (included with macOS).
- **Linux**: `bwrap` must be installed. On Debian/Ubuntu: `apt install bubblewrap`. On Fedora: `dnf install bubblewrap`.

Run `reeboot doctor` to check whether the required sandbox binary is available on your system.
