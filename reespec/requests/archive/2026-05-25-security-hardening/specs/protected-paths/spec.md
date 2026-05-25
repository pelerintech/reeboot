# Spec — protected-paths

The `protected_paths` extension blocks `write` and `edit` tool calls targeting sensitive filesystem paths. Every path documented in `docs/security/permission-tiers.md` must be covered.

## Scenarios

### 1. Blocks write to ~/.ssh

**GIVEN** the agent calls the `write` tool with `path: "/home/user/.ssh/authorized_keys"`
**WHEN** the protected_paths extension intercepts the `tool_call` event
**THEN** the call is blocked with `{ block: true, reason: 'Path "/home/user/.ssh/authorized_keys" is protected' }`

### 2. Blocks write to ~/.aws

**GIVEN** the agent calls the `edit` tool with `path: "/home/user/.aws/credentials"`
**WHEN** the protected_paths extension intercepts the `tool_call` event
**THEN** the call is blocked

### 3. Blocks write to ~/.gnupg

**GIVEN** the agent calls the `write` tool with `path: "/home/user/.gnupg/private-keys-v1.d/xxx.key"`
**WHEN** the protected_paths extension intercepts the `tool_call` event
**THEN** the call is blocked

### 4. Blocks write to system directories

**GIVEN** the agent calls the `edit` tool with `path: "/etc/hosts"`
**WHEN** the protected_paths extension intercepts the `tool_call` event
**THEN** the call is blocked

### 5. Still blocks the original 4 paths

**GIVEN** the agent calls the `write` tool with `path: ".env"`, `.git/config`, `node_modules/evil/index.js`, or `config.json`
**WHEN** the protected_paths extension intercepts the `tool_call` event
**THEN** all four calls are blocked

### 6. Allows writes to safe paths

**GIVEN** the agent calls the `write` tool with `path: "notes.md"`, "/tmp/output.txt", "src/index.ts"
**WHEN** the protected_paths extension intercepts the `tool_call` event
**THEN** all calls are allowed (no block returned)

### 7. Handles absolute path resolution

**GIVEN** the agent's working directory is `/home/user/project` and it calls `write` with path `"../../.ssh/config"`
**WHEN** the protected_paths extension resolves the path against `process.cwd()`
**THEN** the resolved absolute path `/home/user/.ssh/config` matches the `.ssh` protected pattern and is blocked

### 8. Ignores non-write/edit tool calls

**GIVEN** the agent calls `bash`, `read`, `grep`, or any tool other than `write`/`edit`
**WHEN** the protected_paths extension intercepts the `tool_call` event
**THEN** no block is returned (undefined — tool proceeds normally)
