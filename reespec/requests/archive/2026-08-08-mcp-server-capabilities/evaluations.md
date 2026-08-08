## Evaluation — 2026-08-07 20:25

### mcp-server
verdict:  ✅ SATISFIED
reason:   All S1–S7 hold on the outputs. S1: a Streamable HTTP endpoint mounts at `/mcp`
          via `WebStandardStreamableHTTPServerTransport` as a sibling of `/a2a`/`/webhook`
          (src/server.ts `app.route('/mcp', mcpApp)`; no stdio spawn). S2: `toolToMcpTool().run`
          calls `tool.execute(...)` directly, no agent loop (src/mcp-server.ts). S3: `ToolRegistry`
          retains name→execute and both adapters write into it (src/extensions/tool-registry.ts,
          pi-adapter.ts:75, ree-adapter.ts:62). S4: `buildHeadlessContext` synthesizes hasUI:false,
          no-op ui, scratch cwd/workspace, app config/db/modelRegistry (src/extensions/mcp-headless.ts).
          S5: names kept as-is, no `reeboot::` prefix (tool-list test). S6: TypeBox params emitted as
          JSON Schema and results mapped to `CallToolResult` (content/text + isError). S7: backend-down
          returns `{error:...}`/isError and the session stays usable (tests/mcp/degradation.test.ts).
          All 34 tests under tests/mcp/ pass (npx vitest run tests/mcp → 10 files, 34 passed).
focus:    —

### mcp-trust
verdict:  ⚠️ PARTIAL
reason:   S1 read-only substrate (allowlist `READ_ONLY_SUBSTRATE` in src/mcp-server.ts; mutating/UI/
          loop/control-plane excluded, tool-list test). S2/S3 bearer-token auth: `mcpAuthOk` + 401
          authorize gate; loopback trusted (auth-gate test). S5 `mcp.server.apiKey` static key parsed
          in src/config.ts (config test). S6 owner-only mutation: memory/knowledge write tools skipped
          for restricted remote runners via `isRestrictedTurn` / `context.restricted` (owner-only-
          mutation test). S8 headless `confirm-destructive` resolves to deny when `hasUI` is false
          (confirm-destructive.ts:202/#312 headless block path). BUT S4's required edge ply "argument
          schema validation" is NOT present: the `tools/call` path passes `request.params.arguments`
          straight into `tool.execute()` with no validation against the tool's JSON schema, and the
          underlying tools (e.g. knowledge-manager execute) do not validate either — only injection
          scanning and external-source marking run (applyEdgePlies). The conditional `applyAuthLevel()`
          toolset filter in S4 is not wired into the MCP toolset selection.
focus:    src/mcp-server.ts CallToolRequestSchema — no argument JSON-schema validation ply; MCP toolset
          selection in src/server.ts — no applyAuthLevel() filter

### mcp-trust S7
verdict:  ✅ SATISFIED
reason:   Owned decision: the MCP surface is read-only substrate (S1) and scheduler/delegate are
          excluded, so no world-action is surfaced to gate on the MCP surface. With no world-action
          surfaced, token validation (S2/S5) is the sufficient control; no separate permission registry
          is required, matching the contract's "no separate permission registry is required for now."

## Triage

✅ Safe to skip:   mcp-server (all S1–S7); mcp-trust S1, S2, S3, S5, S6, S7, S8
⚠️  Worth a look:  mcp-trust S4 — argument schema validation missing (injection scan + external-source
                   marking present but no JSON-schema validation of args; applyAuthLevel not wired)
❓  Human call:    none

---

## Evaluation — 2026-08-07 20:53

### mcp-server
verdict:  ✅ SATISFIED
reason:   All seven clauses are implemented and covered by passing tests — S1 mounts a
          Streamable HTTP endpoint via `app.route('/mcp', mcpApp)` on the same Hono app as
          `/a2a`/`/webhook` using `WebStandardStreamableHTTPServerTransport` (no stdio child
          process) (`server.ts:1282`, `mcp-server.ts`); S2 calls `tool.execute()` directly with
          no agent loop (`mcp-server.ts` `toolToMcpTool.run`); S3 retains executables in
          `tool-registry.ts` and `ree-adapter.ts:75`/`pi-adapter.ts:62` write into it; S4
          synthesizes a headless `ExtensionContext` (`mcp-headless.ts`); S5 keeps existing
          names (no `reeboot::` prefix); S6 serves TypeBox params as JSON Schema and maps
          results onto `CallToolResult`; S7 returns `{ error }` and keeps the session usable.
          37/37 MCP tests pass (`tests/mcp/*.test.ts`).

### mcp-trust
verdict:  ⚠️ PARTIAL
reason:   S1 read-only-substrate filter (`selectReadOnlyTools`/`READ_ONLY_SUBSTRATE`), S2/S3/S5
          static-API-key auth (`mcpAuthOk` + `mcp.server.apiKey` config), S6 owner-only mutation
          (`context.restricted` gating in `memory-manager.ts`/`knowledge-manager.ts`), and S8
          deny-by-default for headless (`confirm-destructive.ts` mode default `'deny'`) are
          present and tested. However, S4's clause "the `applyAuthLevel()` filter further
          restricts the visible toolset" has no implementation or test in the MCP path — grep
          for `applyAuthLevel`/`minAuthLevel` returns nothing in `mcp-server.ts`, `server.ts`
          (MCP wiring), or `tests/mcp/`. The three other S4 plies (schema validation, injection
          scanning, external-source marking) are implemented in `toolToMcpTool`/`applyEdgePlies`.
focus:    mcp-server.ts / server.ts MCP wiring — applyAuthLevel()/minAuthLevel tier filtering is
          not threaded through the MCP surface; S7 is vacuously satisfied since the surface
          exposes read-only substrate only.

## Triage

✅ Safe to skip:   mcp-server
⚠️  Worth a look:  mcp-trust — S4 applyAuthLevel()/minAuthLevel filter absent from the MCP path
                   (schema validation, injection scanning, and external-source marking are present)
❓  Human call:    none

---
