# Spec — mcp-server

Reeboot is an MCP **server** exposing its real tools as callable MCP tools to external
clients, served as a Streamable HTTP endpoint mounted on the existing Hono app. Invocation
is **pass-through** — each `tools/call` maps to the underlying reeboot tool's `execute()`
run with a synthesized headless context.

## S1 — MCP server is a Streamable HTTP endpoint on the Hono app

- **GIVEN** reeboot is started with an MCP server config
- **WHEN** a client connects via MCP Streamable HTTP at the `/mcp` route
- **THEN** the endpoint performs MCP protocol initialization and advertises the exposed
  tool set, mounted as a sibling of the existing `/a2a` and `/webhook` routes on the same
  Hono app; no child-process (stdio) server is spawned for the primary surface.

## S2 — Exposed tools are pass-through to the underlying tool's execute

- **GIVEN** the active provider / toolset exposes an eligible tool on the MCP surface
- **WHEN** a client sends `tools/call` for that tool with parsed arguments
- **THEN** the server invokes the underlying reeboot `ToolDefinition.execute()` directly
  with the provided params (no agent loop, no model inference) and returns the result —
  the MCP call IS the tool call.

## S3 — Executables are retained via a registry seam

- **GIVEN** tools are registered through the extension adapter
- **THEN** the full `ToolDefinition` (including `execute`) is retained in a registry keyed
  by tool name so the MCP server can invoke them headless — the adapter currently forwards
  to the SDK but does not keep the executable.

## S4 — Pass-through uses a synthesized headless ExtensionContext

- **GIVEN** a tool is invoked via MCP
- **THEN** it receives a synthesized `ExtensionContext` (`hasUI: false`, `ui` no-op,
  `cwd`/`workspacePath` scratch, `config` / `db` / `modelRegistry` from the app), so
  self-contained tools (those pulling `getDb()`/`getLogger()`) run unchanged.

## S5 — Tool names are exposed without an MCP-surface prefix

- **GIVEN** the MCP tool list is advertised
- **THEN** exposed tools keep their existing names (`session_search`, `knowledge_search`,
  `jina_read`, ...; memory capabilities keep `memory::<provider>::<name>`); no new
  `reeboot::` prefix is added.

## S6 — Tool schemas are served as JSON Schema

- **GIVEN** a client requests the tool list
- **THEN** each tool's parameters (TypeBox) are emitted as a valid JSON-Schema MCP tool
  definition, and results are mapped back onto MCP `CallToolResult` correctly.

## S7 — Backend-down degrades instead of failing the surface

- **GIVEN** a read-only substrate tool's backend is unavailable (memory provider down,
  web/jina down, etc.)
- **WHEN** that tool is called over MCP
- **THEN** it returns an explicit, honest error/result (`{ error: "..." }`) without erroring
  or disconnecting the whole MCP session — matching reeboot's graceful-degradation idiom;
  other tools and the connection remain usable.
