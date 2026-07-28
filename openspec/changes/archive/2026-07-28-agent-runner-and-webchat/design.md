## Context

The repo-foundation change established the project skeleton. This change adds the intelligence layer: the `AgentRunner` abstraction, the pi SDK integration, the extension loader, and the first real user-facing interface (WebChat over WebSocket).

The `AgentRunner` interface is the single most important architectural boundary in the codebase. The orchestrator and WebSocket handler will never call pi SDK APIs directly — they call `AgentRunner`. This keeps the swap cost minimal if a second runner backend is ever needed.

## Goals / Non-Goals

**Goals:**
- Define `AgentRunner` + `AgentRunnerFactory` + `RunnerEvent` interfaces (30 lines, defines the boundary)
- Implement `PiAgentRunner` translating pi SDK events to `RunnerEvent`
- Wire `DefaultResourceLoader` with `~/.reeboot/` as agentDir, bundled extensions always active
- WebSocket endpoint with streaming protocol (text_delta, tool_call_start/end, message_end, cancel)
- Built-in WebChat HTML/JS served at `GET /`
- Context system: AGENTS.md hierarchy, workspace dirs, session file management
- Full TDD coverage for runner, loader, WebSocket handler, context module

**Non-Goals:**
- Channel adapters (WhatsApp/Signal — Week 3)
- Message routing rules (Week 3)
- In-chat commands `/context`, `/new`, etc. (Week 3)
- Scheduler (Week 4)
- Credential proxy (Week 4)

## Decisions

### AgentRunner interface is minimal and synchronous-friendly
The interface exposes three methods: `prompt()`, `abort()`, `dispose()`. `prompt()` takes a callback for events rather than returning an async iterable, because the WebSocket handler needs to forward deltas immediately as they arrive — the callback pattern maps directly to `ws.send()` with no buffering.

### PiAgentRunner creates one session per context, lazily
A new `PiAgentRunner` is created by the factory when a context receives its first message. The underlying pi `AgentSession` is long-lived within a session (handles compaction internally). The runner is disposed when the session ends (timeout or `/new` command — both Week 3).

### Extension loader uses DefaultResourceLoader with extensionFactories
Bundled extensions are loaded via `extensionFactories` option — they are always active for every context regardless of `~/.reeboot/extensions/` contents. This ensures sandbox, confirm-destructive, and protected-paths are always on (unless toggled off in config). User extensions in `~/.reeboot/extensions/` and `~/.reeboot/contexts/<name>/.pi/extensions/` are discovered automatically by `DefaultResourceLoader`.

### WebSocket protocol is unidirectional streaming, one turn at a time
The client sends one `{ type: "message", content }` at a time. The server streams back events until `message_end`. A `{ type: "cancel" }` message from the client calls `runner.abort()`. No multiplexing — simplicity over throughput (personal agent use case). This matches the protocol defined in the architecture doc exactly.

### WebChat is a single HTML file, no bundler
The built-in WebChat is `src/webchat/index.html` — a self-contained HTML file with inline `<script>`. No React, no bundler. It uses the native WebSocket API and DOM. Served by Fastify `@fastify/static` (or inline `reply.sendFile`). It is the minimum viable chat UI for testing the agent.

### Context system: lazy creation, AGENTS.md hierarchy
Contexts are loaded from `~/.reeboot/config.json` at startup. The `main` context is always created. Additional contexts are created via `reeboot contexts create <name>` or the API. Workspace directories are created lazily on first agent turn. AGENTS.md files are scaffolded from templates on context creation. The global AGENTS.md at `~/.reeboot/contexts/global/AGENTS.md` is prepended to every context's system prompt by the pi resource loader.

### Token meter writes to SQLite asynchronously via better-sqlite3
`token-meter.ts` subscribes to `agent_end` events and inserts a row into `usage` via the `getDb()` singleton. Since better-sqlite3 is synchronous, this is a straightforward insert with no async concerns.

### Bundled extensions are copied from pi examples at build time
Rather than importing them as npm dependencies, the pi extension source files are copied into `extensions/` at repo creation time. This avoids a circular import concern and allows them to be customized independently. The pi SDK's `DefaultResourceLoader` accepts a path to the extensions directory.

## Risks / Trade-offs

- **pi SDK event API compatibility**: The `session.subscribe()` event names must match what pi actually emits. → Mitigation: read pi SDK source/examples in the pi package before implementing; pin pi SDK version; add integration test that sends a real message to a mock model.
- **WebSocket graceful shutdown**: In-flight agent turns must complete (or be aborted) before the server closes. → Mitigation: `stopServer()` calls `runner.abort()` for all active sessions, then waits for them to resolve before `fastify.close()`.
- **Context workspace permissions**: The agent has write access to its workspace. The bundled `protected-paths.ts` extension prevents writes to sensitive paths. → This is acceptable for Phase 1 personal use.
- **pi DefaultResourceLoader agentDir vs cwd**: `agentDir` is `~/.reeboot/` (global extensions/skills); `cwd` is the context's workspace. These must not be confused. → Mitigation: explicit variable naming in `loader.ts`; test coverage.

## Open Questions

- Should `PiAgentRunner` expose a `reload()` method to call `loader.reload()` without recreating the session? → **Decision**: Yes. `reload()` calls `loader.reload()` on the existing `DefaultResourceLoader`. The `reeboot reload` command will call this on all active runners. Implement in this change since the loader is set up here.
- What is the correct pi SDK event structure for `tool_execution_start` vs `tool_execution_end`? → Read pi SDK source code at implementation time and document the mapping in a comment in `pi-runner.ts`. Update `architecture-decisions.md` with the actual event field names found.
