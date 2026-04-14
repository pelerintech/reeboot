# Design: Permission Tiers

## Architecture Overview

```
config.json
  mcp.servers[].permissions     →  McpPermissions (network, filesystem)
  permissions.violations.log    →  ViolationConfig

src/trust.ts                    →  TrustLevel, McpPermissions, evaluatePermissions()
                                   Shared primitive reused by channel-trust (R2a)

mcp-manager.ts                  →  McpServerPool.getOrConnect()
  ↓ reads permissions from config
  ↓ selects sandbox wrapper (sandbox-exec / bwrap)
  ↓ spawns server subprocess with restrictions applied
  ↓ logs violations when server errors propagate back

config.ts                       →  McpServerSchema extended with permissions
                                   Top-level PermissionsConfigSchema added
```

---

## Trust Primitives (`src/trust.ts`)

A new shared module introduces the types that both this request and R2a (channel-trust) will use.

```typescript
export const TrustLevel = {
  Builtin: 'builtin',   // bundled extensions — full permissions, no restrictions
  Mcp:     'mcp',       // MCP servers — configurable, default deny
  Skill:   'skill',     // skills — prompt-level only (R2b)
} as const;

export type TrustLevel = typeof TrustLevel[keyof typeof TrustLevel];

// Capabilities that can be explicitly granted to MCP servers.
// Credentials, subprocess, and conversation-read are never grantable.
export interface McpPermissions {
  network:    boolean;              // outbound network calls — default false
  filesystem: boolean;              // read-only filesystem access — default false
                                    // write access is never grantable via config
}

export const MCP_DEFAULTS: McpPermissions = {
  network:    false,
  filesystem: false,
};
```

This module is intentionally minimal — it defines types and defaults only. Logic lives in the consumers.

---

## Sandbox Integration

### How the existing sandbox works

`extensions/sandbox/index.ts` uses `@anthropic-ai/sandbox-runtime` to wrap **bash tool calls** with OS-level restrictions (sandbox-exec on macOS, bubblewrap on Linux). It reads config from `~/.pi/agent/sandbox.json` and `.pi/sandbox.json`.

This sandbox applies only to bash commands executed by the agent. It does **not** apply to child processes spawned directly by reeboot (i.e., MCP servers).

### MCP server sandboxing approach

MCP servers are spawned via `StdioClientTransport` in `mcp-manager.ts`:

```typescript
const transport = new StdioClientTransport({
  command: serverCfg.command,
  args: serverCfg.args,
  env: { ...process.env, ...serverCfg.env },
});
```

To sandbox an MCP server, we wrap the command with the OS sandbox tool before passing it to `StdioClientTransport`:

**macOS (sandbox-exec):**
```typescript
// No permissions granted (default deny):
command: 'sandbox-exec',
args: ['-f', '/path/to/mcp-restricted.sb', serverCfg.command, ...serverCfg.args]

// Network granted:
command: 'sandbox-exec',
args: ['-f', '/path/to/mcp-network.sb', serverCfg.command, ...serverCfg.args]
```

**Linux (bubblewrap):**
```typescript
// No permissions granted:
command: 'bwrap',
args: ['--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev',
       '--tmpfs', '/tmp', '--unshare-net',
       serverCfg.command, ...serverCfg.args]

// Network granted: omit --unshare-net
```

**Fallback (sandbox unavailable):** if neither `sandbox-exec` nor `bwrap` is available, log a warning and spawn without sandboxing. Reeboot does not fail startup — sandboxing is best-effort, same as the existing bash sandbox.

### Sandbox profiles

Two new sandbox-exec profiles added to `extensions/sandbox/`:

- `mcp-restricted.sb` — deny all network, deny filesystem write, allow tmpfs and process operations
- `mcp-network.sb` — allow network egress, deny filesystem write, allow tmpfs

Filesystem read-only (`filesystem: true`) is implemented via the existing sandbox-exec allow-read directives, restricted to tmpfs and the server's working directory.

---

## Violation Logging

When an MCP server's subprocess is blocked by the OS sandbox, the server process receives an OS error (EPERM, EACCES, or network refused). This error propagates back through the MCP SDK as a tool call error, which reeboot receives in `mcp-manager.ts`.

Violation detection: when a tool call to an MCP server returns an error whose message matches known OS sandbox error patterns (EPERM, EACCES, connection refused on expected operations), log a structured violation entry.

```typescript
interface ViolationEntry {
  timestamp: string;      // ISO 8601
  server: string;         // MCP server name
  tool: string;           // tool that was called
  error: string;          // raw error message
  permissions: McpPermissions;  // the server's declared permissions at time of call
}
```

Violations are logged via the existing pino logger at `warn` level with `event: 'mcp_permission_violation'`. If `permissions.violations.log` is false in config, the log call is skipped.

Note: violation detection is heuristic (based on error message patterns), not authoritative. The OS sandbox is the enforcement authority. This logging is observability, not a security boundary.

---

## Config Schema Changes

### `McpServerSchema` extension

```typescript
const McpPermissionsSchema = z.object({
  network:    z.boolean().default(false),
  filesystem: z.boolean().default(false),
});

const McpServerSchema = z.object({
  name:        z.string().min(1),
  command:     z.string().min(1),
  args:        z.array(z.string()).default([]),
  env:         z.record(z.string()).default({}),
  permissions: McpPermissionsSchema.default({}),   // ← new
});
```

### Top-level `permissions` block

```typescript
const ViolationConfigSchema = z.object({
  log: z.boolean().default(true),
});

const PermissionsConfigSchema = z.object({
  violations: ViolationConfigSchema.default({}),
});

// Added to ConfigSchema:
permissions: PermissionsConfigSchema.default({}),
```

---

## What is NOT in this request

- **Per-tool granularity within MCP servers**: permissions are per-server only. All tools on a given server share the same sandbox.
- **Credential and subprocess restrictions as config options**: these are never grantable. They are enforced by the sandbox profile regardless of config.
- **Built-in extension restrictions**: built-in extensions retain full permissions. The `TrustLevel.Builtin` type is defined here for R2a to use but has no enforcement in this request.
- **Skill-level enforcement**: skills are SKILL.md prompts — no subprocess, no enforcement here.
- **Approval flows**: violations are logged and blocked, never escalated to the user in-channel.

---

## Risks

**Sandbox availability**: `sandbox-exec` is available on macOS by default. `bwrap` (bubblewrap) must be installed on Linux. If neither is present, MCP servers run without sandboxing. Mitigated by logging a startup warning when sandboxing is unavailable for configured servers.

**False violation detection**: the heuristic pattern matching on error messages may produce false positives (a legitimate server failure looks like a sandbox violation). Mitigated by logging the full error message alongside the violation classification.

**Compatibility with existing MCP configs**: adding `permissions` to `McpServerSchema` with `.default({})` is backwards-compatible — existing configs without the field parse as the default-deny defaults, which is intentionally conservative.
