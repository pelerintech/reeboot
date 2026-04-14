# Brief: Permission Tiers

## Problem

Reeboot has no capability restrictions on what extensions or MCP servers can do at runtime. Every component — whether a bundled extension or a third-party MCP server installed by the user — runs with the same level of access: filesystem, network, credentials, subprocesses.

This creates a concrete supply chain risk. A malicious or compromised MCP server can exfiltrate credentials, read sensitive config files, make arbitrary network calls, or inject instructions into the agent's tool descriptions — all without the user knowing. Research into real-world MCP attacks documents the following attack chains that capability restrictions would block:

- **Credential harvest**: read `~/.env`, `config.json`, SSH keys and exfiltrate via outbound HTTP
- **Data exfiltration via URL**: encode conversation context or file contents into a fetch URL delivered to an attacker server
- **Covert shell/file ops via MCP Sampling**: trigger hidden file reads or subprocess spawns outside the normal tool-call UI
- **Malicious MCP config injection**: write rogue server entries into reeboot's own config files

The OS-level sandbox (`extensions/sandbox/`) provides process-level isolation but is all-or-nothing and not integrated with the MCP spawn lifecycle. There is no per-extension or per-server capability declaration or enforcement.

## Goal

Introduce a permission tier system that restricts what MCP servers can do based on declared capabilities, enforced at both the OS sandbox level (for subprocess isolation) and the JS tool-call hook level (for built-in extensions). Violations are logged by default.

The implementation must be generic. The specific attack patterns discussed during discovery (credential harvest, data exfiltration, covert shell ops) are examples that informed the design — not an exhaustive list. The capability restrictions and enforcement infrastructure should protect against the full class of threats: any malicious or compromised extension that attempts to access resources, exfiltrate data, or escalate privileges — including scenarios not anticipated at design time.

## Approach

**Two enforcement layers:**

1. **JS hook** (`tool_call` event via pi's ExtensionAPI) — intercepts tool calls from built-in extensions and evaluates them against a permission policy. Used by `protected-paths.ts` today but not generalised.

2. **OS sandbox profile at MCP spawn time** — when `mcp-manager.ts` spawns a server subprocess, it selects a sandbox profile based on the server's declared permission tier. Builds on the existing `extensions/sandbox/` profiles (sandbox-exec on macOS, bubblewrap on Linux).

**Permission model:** default deny for MCP servers. Each server declares the capabilities it needs in `config.json`. Undeclared capabilities are blocked. Built-in extensions retain full permissions.

**Shared trust infrastructure:** a `TrustLevel` type and a `PermissionPolicy` interface are introduced as shared primitives, designed to be reused by the follow-on channel trust request (Request 2).

**Violation behaviour:** blocked calls are logged to the structured event log by default. Logging can be disabled in config but cannot be replaced with silent-allow without an explicit capability grant.

## Scope

- `src/trust.ts` — new shared module: `TrustLevel` enum, `PermissionPolicy` interface, `evaluatePolicy()` utility (~60–80 LOC)
- `src/extensions/mcp-manager.ts` — sandbox profile selection at spawn time based on declared server permissions (~50 LOC added)
- `src/extensions/loader.ts` — generalise the tool_call hook to evaluate built-in extension calls against policy (~40 LOC)
- `src/config.ts` — new `mcp.servers[].permissions` schema and top-level `permissions` config block (~40 LOC)
- `src/extensions/sandbox/` — new restricted sandbox profile for MCP servers (network-off, filesystem read-only variants)
- Tests covering: policy evaluation, spawn-time profile selection, violation logging (~150–200 LOC)

## Out of Scope (v1)

- Skill-level permission enforcement (prompt-level — deferred to channel-trust request)
- HTTP/SSE MCP server sandboxing (stdio only, consistent with MCP client v1)
- Per-tool granularity within an MCP server (per-server tiers only)
- Approval flows / owner notification on violation (logged block only)
- Wizard config step for permissions (manual config only)

## Config Shape

```json
{
  "permissions": {
    "violations": {
      "log": true
    }
  },
  "mcp": {
    "servers": [
      {
        "name": "postgres",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-postgres"],
        "env": { "DATABASE_URL": "postgres://localhost/mydb" },
        "permissions": {
          "network": false,
          "filesystem": "read-only",
          "credentials": false,
          "subprocess": false
        }
      },
      {
        "name": "web-fetcher",
        "command": "npx",
        "args": ["-y", "@my/web-fetcher-mcp"],
        "permissions": {
          "network": true,
          "filesystem": false,
          "credentials": false,
          "subprocess": false
        }
      }
    ]
  }
}
```

## Capability Matrix

| Capability          | Built-in extension | MCP server (default) | MCP server (granted) |
|---------------------|--------------------|----------------------|----------------------|
| Filesystem read     | ✅                 | ❌                   | ✅ (opt-in)          |
| Filesystem write    | ✅                 | ❌                   | ❌ (never via tier)  |
| Network egress      | ✅                 | ❌                   | ✅ (opt-in)          |
| Credential access   | ✅                 | ❌                   | ❌ (never via tier)  |
| Subprocess spawn    | ✅                 | ❌                   | ❌ (never via tier)  |
| Read conversation   | ✅                 | ❌                   | ❌ (never via tier)  |

## Key Decisions Made in Discovery

- **Two threat vectors addressed**: capability-level attacks (credential harvest, data exfiltration, covert ops) via OS sandbox; prompt-level attacks (tool poisoning, indirect injection) deferred to the channel-trust request.
- **Default deny for MCP**: all MCP servers start with no capabilities. The user opts in per-server in config. This is intentionally conservative — a legitimate MCP server that needs network access declares it explicitly.
- **Logged block as default**: violations are recorded but not surfaced to the user in-channel unless they configure notifications. Logging can be disabled but silent-allow requires an explicit capability grant.
- **Shared trust infrastructure first**: `TrustLevel` and `PermissionPolicy` are introduced here as shared primitives so the channel-trust request (Request 2) can build on them without duplication.
- **Skills deferred**: skills are SKILL.md markdown files — there is no code to sandbox. Skill trust enforcement is prompt-level and belongs in the channel-trust request.
- **B before A sequencing**: this request (extension tiers) is intentionally built before the channel-trust request because it establishes the enforcement infrastructure that Request 2 will reuse.
