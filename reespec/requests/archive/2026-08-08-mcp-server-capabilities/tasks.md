# Tasks — mcp-server-capabilities

Vertical-slice TDD: one test → one implementation → repeat. Working dir: `reeboot/`.
Tests live under `reeboot/tests/mcp/`. RED always produces a runnable test file (Vitest)
or a binary assertion. GREEN runs the suite / re-checks the assertion.

## 1. Registry seam retains full ToolDefinitions for headless invocation

- [x] **RED** — Write `tests/mcp/registry-seam.test.ts`: register two tools through the
      seam (a memory-recall style self-contained tool and one needing ctx), assert the
      registry retains name → `execute` (a function) and that a stored `execute` can be
      invoked headless with a minimal ctx. Run → fails (no registry exists / adapter does
      not retain executables).
- [x] **ACTION** — Add a shared tool registry (bypassing the SDK for read-back) that
      captures every `ToolDefinition` at `registerTool` time, keyed by name, retaining
      `execute` + `parameters` + `description`.
- [x] **GREEN** — Run the test → passes; existing `pi-adapter`/`ree-adapter` tests still
      pass.

## 2. Headless ExtensionContext synthesizer

- [x] **RED** — Write `tests/mcp/headless-ctx.test.ts`: assert `buildHeadlessContext({config, db, modelRegistry})` yields `hasUI:false`, a no-op `ui`, scratch `workspacePath`, and passes through `config`/`db`/`modelRegistry`. Run → fails (function absent).
- [x] **ACTION** — Implement the headless-context builder producing a standards-compliant
      `ExtensionContext` for pass-through calls.
- [x] **GREEN** — Run the test → passes.

## 3. Streamable HTTP /mcp route mounts on the Hono app

- [x] **RED** — Write `tests/mcp/route-mount.test.ts`: call `buildApp(...).request('/mcp', ...)` with an MCP initialize request and assert the route responds with the MCP server info (protocol `initialize` handled, e.g. 200 + server `name`/`version`/`protocolVersion`). Run → fails (no `/mcp` route).
- [x] **ACTION** — Mount an MCP Streamable HTTP handler at `/mcp` on the Hono app alongside
      `/a2a` and `/webhook`, serving the MCP initialize handshake.
- [x] **GREEN** — Run the test → passes; `server.test` still green.

## 4. Pass-through dispatch: tools/call → execute with headless ctx

- [x] **RED** — Write `tests/mcp/pass-through.test.ts`: after initialize, send `tools/call`
      for a registered read-only tool and assert the returned `CallToolResult` equals the
      tool's `execute()` output (no agent loop). Run → fails (not implemented).
- [x] **ACTION** — Wire `tools/call` to look up the retained `execute` and invoke it with a
      synthesized headless ctx, mapping the result onto `CallToolResult`.
- [x] **GREEN** — Run the test → passes.

## 5. Tool-list advertisement: JSON Schema, existing names, substrate only

- [x] **RED** — Write `tests/mcp/tool-list.test.ts`: assert `tools/list` exposes only
      read-only-substrate tools (`knowledge_search` present; `memory`-write, `knowledge_file`,
      `render_*`, scheduler, budget, `delegate`, `mcp` absent), with existing names (no
      `reeboot::` prefix) and JSON-Schema `inputSchema`. Run → fails (wrong/existing surface).
- [x] **ACTION** — Implement the eligibility filter emitting the advertised tool list with
      TypeBox→JSON-Schema conversion and no surface prefix, exposing only headless-safe,
      read-only substrate tools.
- [x] **GREEN** — Run the test → passes.

## 6. Auth gate: loopback trusted, non-loopback requires bearer token

- [x] **RED** — Write `tests/mcp/auth-gate.test.ts`: with `mcp.server.apiKey` set, a
      non-loopback request with no/ wrong key is rejected (401) and no tool list is served;
      a correct `Authorization: Bearer` key succeeds; a loopback request with no key succeeds.
      Run → fails (no gate).
- [x] **ACTION** — Add the loopback-vs-token gate to the `/mcp` handler (mirroring the A2A
      and `/ws/chat` auth behavior).
- [x] **GREEN** — Run the test → passes.

## 7. Edge trust plies on every tools/call: injection scan + external-source mark

- [x] **RED** — Write `tests/mcp/edge-plies.test.ts`: a tool whose result/params trigger the
      injection scanner is surfaced honestly (flagged/treated-as-data, not executed
      untrusted); non-builtin-provider tool results are marked as external source. Run →
      fails (plies not applied at the edge).
- [x] **ACTION** — Thread the existing injection scanner + external-source marking into the
      pass-through call path.
- [x] **GREEN** — Run the test → passes.

## 8. Graceful degradation at the edge

- [x] **RED** — Write `tests/mcp/degradation.test.ts`: a read-only tool whose backend is
      unavailable returns an explicit `{ error: ... }` result over MCP and the session stays
      usable for a following healthy call. Run → fails (errors kill the session / not honest).
- [x] **ACTION** — Ensure backend-down degrades to an honest per-tool result without dropping
      the MCP connection.
- [x] **GREEN** — Run the test → passes.

## 9. Owner-only memory/ knowledge mutation for remote runners

- [x] **RED** — Write `tests/mcp/owner-only-mutation.test.ts`: a remote (A2A/webhook) runner
      does not have `memory` add/replace/remove or `knowledge_ingest` available, while a local
      assistant turn does (natural-language "remove X from memory" via A2A is not executed as a
      write). Run → fails (remote runner still exposes writes).
- [x] **ACTION** — Restrict the remote runner's toolset/trust flag so memory & knowledge-corpus
      mutation is unavailable to remote turns; keep the assistant session full-access.
- [x] **GREEN** — Run the test → passes; existing `delegate/a2a-*` tests still pass.

## 10. Config: `mcp` block (enabled, server.apiKey) validated in schema

- [x] **RED** — Write `tests/mcp/config.test.ts`: assert `mcp.enabled` and `mcp.server.apiKey`
      parse/validate, and an `apiKey` is rejected when remote binding is off is NOT required;
      malformed block is rejected at parse. Run → fails (no `mcp` block in schema).
- [x] **ACTION** — Add the `mcp` config block to the zod `ConfigSchema` (enabled,
      server.apiKey), consistent with the a2a/server pattern.
- [x] **GREEN** — Run the test → passes; `config-schema*` tests still pass.
