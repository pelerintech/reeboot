# Tasks: MCP Client

---

### 1. Config schema — mcp.servers parsed and validated

- [x] **RED** — Write `tests/mcp-config.test.ts`: import `loadConfig` + `ConfigSchema`, assert that (a) a config with a valid `mcp.servers` entry parses correctly, (b) a config with no `mcp` key produces `mcp.servers = []`, (c) a server missing `name` throws ZodError, (d) a server missing `command` throws ZodError, (e) a server with no `args`/`env` defaults to `[]`/`{}`. Run `npx vitest run tests/mcp-config.test.ts` → fails (no `mcp` key in schema).
- [x] **ACTION** — Add `McpServerSchema` and `McpConfigSchema` to `src/config.ts`. Add `mcp: McpConfigSchema.default({})` to `ConfigSchema`. Add `mcp` toggle (`true`) to `ExtensionsCoreConfigSchema`.
- [x] **GREEN** — Run `npx vitest run tests/mcp-config.test.ts` → all assertions pass.

---

### 2. mcp-manager extension registers the `mcp` tool

- [x] **RED** — Write `tests/mcp-manager.test.ts`: import `mcpManagerExtension` from `src/extensions/mcp-manager.ts`, build a `makeMockPi()` (same pattern as skill-manager tests), call the extension with empty `mcp.servers`, assert `pi.registerTool` was called exactly once with `name === "mcp"`. Run `npx vitest run tests/mcp-manager.test.ts` → fails (file does not exist).
- [x] **ACTION** — Create `src/extensions/mcp-manager.ts` with `mcpManagerExtension(pi, config)`. Register the `mcp` tool stub (action/server/tool/args params, returns `"not implemented"` for now). Export as default.
- [x] **GREEN** — Run `npx vitest run tests/mcp-manager.test.ts` → tool registration assertion passes.

---

### 3. System prompt injection lists configured servers

- [x] **RED** — In `tests/mcp-manager.test.ts`: add test that calls `mcpManagerExtension` with two servers configured (`postgres`, `github`), fires `before_agent_start` with a base system prompt, asserts the returned `systemPrompt` contains "postgres", "github", and usage example text for `action: "list"`. Run → fails (injection not implemented).
- [x] **ACTION** — Implement `before_agent_start` handler in `mcp-manager.ts`: if `config.mcp.servers` is non-empty, append `<mcp_servers>` snippet listing server names and usage. Return `undefined` if no servers.
- [x] **GREEN** — Run `npx vitest run tests/mcp-manager.test.ts` → injection assertions pass.

---

### 4. `McpServerPool` — connect and list tools

- [x] **RED** — In `tests/mcp-manager.test.ts`: add test for `mcp({ action: "list", server: "postgres" })`. Mock `@modelcontextprotocol/sdk` `Client` class: stub `connect()` to resolve, stub `listTools()` to return `{ tools: [{ name: "query", description: "Run SQL" }] }`. Assert the tool execute returns a JSON array containing `{ name: "query" }`. Assert `Client.connect` was called once. Run → fails (list action not implemented).
- [x] **ACTION** — Implement `McpServerPool` class in `mcp-manager.ts` with `getOrConnect(name)` method. Implement `list` action in the `mcp` tool: call `pool.getOrConnect(name)`, call `client.listTools()`, return JSON-serialised tool array.
- [x] **GREEN** — Run `npx vitest run tests/mcp-manager.test.ts` → list action assertions pass.

---

### 5. Unknown server name returns error text

- [x] **RED** — In `tests/mcp-manager.test.ts`: add test calling `mcp({ action: "list", server: "unknown" })` when only "postgres" is configured. Assert the tool result text contains "Unknown MCP server: unknown" and contains "postgres". Run → fails (no error handling for unknown server).
- [x] **ACTION** — In the `mcp` tool execute handler, check `config.mcp.servers.find(s => s.name === params.server)`. If not found, return error text listing configured names.
- [x] **GREEN** — Run `npx vitest run tests/mcp-manager.test.ts` → unknown server assertions pass.

---

### 6. `mcp` tool — `call` action routes to MCP server

- [x] **RED** — In `tests/mcp-manager.test.ts`: add test for `mcp({ action: "call", server: "postgres", tool: "query", args: { sql: "SELECT 1" } })`. Stub `client.callTool({ name: "query", arguments: { sql: "SELECT 1" } })` to return `{ content: [{ type: "text", text: "1 row" }] }`. Assert tool result text contains "1 row". Run → fails (call action not implemented).
- [x] **ACTION** — Implement `call` action in `mcp` tool: `pool.getOrConnect(name)`, `client.callTool({ name: params.tool, arguments: params.args })`, serialise `content` array to text.
- [x] **GREEN** — Run `npx vitest run tests/mcp-manager.test.ts` → call action assertions pass.

---

### 7. Subprocess reuse — second call does not re-spawn

- [x] **RED** — In `tests/mcp-manager.test.ts`: add test that calls `mcp({ action: "list", server: "postgres" })` twice. Assert `Client` constructor was called exactly once (not twice). Run → may already pass, confirm with assertion.
- [x] **ACTION** — Verify `McpServerPool.getOrConnect` checks `_clients` map before spawning. Fix if constructor is called more than once.
- [x] **GREEN** — Run `npx vitest run tests/mcp-manager.test.ts` → constructor-called-once assertion passes.

---

### 8. Spawn failure returns error text (not a throw)

- [x] **RED** — In `tests/mcp-manager.test.ts`: add test where `Client.connect()` rejects with `new Error("spawn ENOENT")`. Call `mcp({ action: "list", server: "postgres" })`. Assert result text contains "Failed to start MCP server" and does not throw. Run → fails (unhandled rejection).
- [x] **ACTION** — Wrap `pool.getOrConnect` in try/catch inside the tool execute handler. Return error text on failure.
- [x] **GREEN** — Run `npx vitest run tests/mcp-manager.test.ts` → spawn error assertions pass.

---

### 9. `session_shutdown` disconnects all servers

- [x] **RED** — In `tests/mcp-manager.test.ts`: add test that connects two servers ("postgres", "github"), fires `session_shutdown`, asserts `client.close()` was called on both mocked clients. Run → fails (session_shutdown not implemented).
- [x] **ACTION** — Add `pi.on('session_shutdown', ...)` handler that calls `pool.disconnectAll()`. Implement `disconnectAll()` on `McpServerPool` to call `client.close()` on each cached client.
- [x] **GREEN** — Run `npx vitest run tests/mcp-manager.test.ts` → shutdown assertions pass.

---

### 10. Loader wiring — mcp-manager toggled by config

- [x] **RED** — In `tests/extensions/loader.test.ts`: add tests asserting (a) default config produces a factories array that includes one more factory than before this change (mcp enabled by default), (b) config with `extensions.core.mcp: false` produces the same count as before. Run → fails (mcp not wired).
- [x] **ACTION** — In `src/extensions/loader.ts` `getBundledFactories()`: read `(core as any).mcp ?? true`, add the `importExt('mcp-manager')` factory when enabled. Add `@modelcontextprotocol/sdk` to `package.json` dependencies and run `npm install`.
- [x] **GREEN** — Run `npx vitest run tests/extensions/loader.test.ts` → wiring assertions pass. Run `npx tsc --noEmit` → no type errors.

---

### 11. Full test suite stays green

- [x] **RED** — Assert: `npx vitest run` currently exits 0. (Baseline check before this PR.)
- [x] **ACTION** — Fix any test failures or type errors introduced by the new schema keys or import changes.
- [x] **GREEN** — Run `npx vitest run` → exits 0. Run `npx tsc --noEmit` → exits 0.
