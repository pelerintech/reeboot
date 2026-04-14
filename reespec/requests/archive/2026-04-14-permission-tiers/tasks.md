# Tasks: Permission Tiers

## 1. Trust primitives module

- [x] **RED** — Write `tests/trust.test.ts`: import `TrustLevel`, `MCP_DEFAULTS` from `../src/trust.ts`; assert `TrustLevel.Builtin === 'builtin'`, `TrustLevel.Mcp === 'mcp'`, `TrustLevel.Skill === 'skill'`; assert `MCP_DEFAULTS.network === false` and `MCP_DEFAULTS.filesystem === false`. Run `npx vitest run tests/trust.test.ts` → fails (module does not exist).
- [x] **ACTION** — Create `src/trust.ts` with `TrustLevel` const object, `McpPermissions` interface, and `MCP_DEFAULTS` constant.
- [x] **GREEN** — Run `npx vitest run tests/trust.test.ts` → passes.

---

## 2. Config schema — MCP server permissions field

- [x] **RED** — Add to `tests/mcp-config.test.ts`: call `loadConfig()` with a fixture containing `mcp.servers[0].permissions = { network: true, filesystem: false }`; assert parsed value matches. Also assert a server with no `permissions` field parses as `{ network: false, filesystem: false }`. Run `npx vitest run tests/mcp-config.test.ts` → fails (field not in schema).
- [x] **ACTION** — Add `McpPermissionsSchema` to `src/config.ts` and extend `McpServerSchema` with `permissions: McpPermissionsSchema.default({})`.
- [x] **GREEN** — Run `npx vitest run tests/mcp-config.test.ts` → passes.

---

## 3. Config schema — top-level permissions block

- [x] **RED** — Add to `tests/mcp-config.test.ts`: assert `loadConfig()` with `{ permissions: { violations: { log: false } } }` parses to `config.permissions.violations.log === false`; assert config with no `permissions` field parses to `config.permissions.violations.log === true`. Run → fails (field not in schema).
- [x] **ACTION** — Add `ViolationConfigSchema`, `PermissionsConfigSchema` to `src/config.ts` and add `permissions: PermissionsConfigSchema.default({})` to `ConfigSchema`.
- [x] **GREEN** — Run `npx vitest run tests/mcp-config.test.ts` → passes.

---

## 4. Sandbox profiles on disk

- [x] **RED** — Check: `reeboot/extensions/sandbox/mcp-restricted.sb` does not exist; `reeboot/extensions/sandbox/mcp-network.sb` does not exist. Assertion fails — files are absent.
- [x] **ACTION** — Write `extensions/sandbox/mcp-restricted.sb` (deny all network, deny filesystem write, allow proc/tmpfs) and `extensions/sandbox/mcp-network.sb` (allow network egress, deny filesystem write). Write equivalent bwrap arg sets as JSON files for Linux: `mcp-restricted.bwrap.json` and `mcp-network.bwrap.json`.
- [x] **GREEN** — Verify: all four files exist and are non-empty. The `.sb` files contain valid sandbox-exec directives (`(version 1)` header present). The `.bwrap.json` files parse as JSON arrays of strings.

---

## 5. Sandbox wrapper selection in McpServerPool

- [x] **RED** — Write `tests/mcp-manager.test.ts` (extend existing): add a test that spies on `StdioClientTransport` constructor; configure a server with default permissions; call `pool.getOrConnect(name)` with a mock sandbox wrapper; assert the transport was called with `command: 'sandbox-exec'` and args starting with `['-f', /mcp-restricted\.sb/]`. Run `npx vitest run tests/mcp-manager.test.ts` → fails (no wrapper applied).
- [x] **ACTION** — In `McpServerPool.getOrConnect()`: apply sandbox wrapper before spawning. Used dependency injection (`sandboxWrapper` constructor param and optional `pool` param on `mcpManagerExtension`) instead of module-level `which` mock — avoids CJS/ESM dynamic import mocking fragility.
- [x] **GREEN** — Run `npx vitest run tests/mcp-manager.test.ts` → passes.

---

## 6. Graceful fallback when sandbox unavailable

- [x] **RED** — Add to `tests/mcp-manager.test.ts`: inject a fallback wrapper; assert `McpServerPool.getOrConnect()` spawns with the original command (no wrapper); assert a `warn` log entry with message matching `sandbox unavailable` is emitted. Run → fails (no fallback path implemented).
- [x] **ACTION** — In `defaultSandboxWrapper`: if no sandbox tool found, log warning and spawn without wrapping.
- [x] **GREEN** — Run `npx vitest run tests/mcp-manager.test.ts` → passes.

---

## 7. Violation logging on OS-level errors

- [x] **RED** — Add to `tests/mcp-manager.test.ts`: mock an MCP client where `callTool()` rejects with `Error('EPERM: operation not permitted')`; call the `mcp` proxy tool; assert a `warn` log entry with `event: 'mcp_permission_violation'` and fields `server`, `tool`, `error`, `permissions` is emitted. Run → fails (no violation logging).
- [x] **ACTION** — In `mcp-manager.ts` `execute()`: after a tool call error, check if error message matches OS sandbox error patterns (`EPERM`, `EACCES`, `connection refused`); if match and `config.permissions.violations.log` is true, log structured violation entry at `warn` level.
- [x] **GREEN** — Run `npx vitest run tests/mcp-manager.test.ts` → passes.

---

## 8. Violation logging disabled by config

- [x] **RED** — Add to `tests/mcp-manager.test.ts`: same EPERM scenario with `config.permissions.violations.log = false`; assert no `mcp_permission_violation` log entry is emitted; assert error is still returned to caller. Run → fails (logging not gated by config).
- [x] **ACTION** — Gate the violation log call on `config.permissions.violations.log`.
- [x] **GREEN** — Run `npx vitest run tests/mcp-manager.test.ts` → passes.

---

## 9. Full test suite green

- [x] **RED** — Check: `npx vitest run` exits non-zero or has failing tests related to config schema changes (existing tests may fail due to `ConfigSchema` additions).
- [x] **ACTION** — Fix any existing tests broken by the schema additions (snapshot updates, fixture updates).
- [x] **GREEN** — Run `npx vitest run` → all tests pass, exit 0.
