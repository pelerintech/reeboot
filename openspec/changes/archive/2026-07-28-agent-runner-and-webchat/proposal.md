## Why

The foundation (CLI, config, DB, HTTP server) is in place. The core value of reeboot is the ability to send a message and get an intelligent AI response. This change wires the pi SDK into the system — establishing the `AgentRunner` abstraction, implementing `PiAgentRunner`, setting up the extension/skills loader, adding the WebSocket chat endpoint, and delivering the built-in WebChat UI. The milestone is: a user opens a browser, types a message, and the agent replies via streaming.

## What Changes

- Add `src/agent-runner/interface.ts` — `AgentRunner`, `AgentRunnerFactory`, `RunnerEvent` interfaces
- Add `src/agent-runner/pi-runner.ts` — `PiAgentRunner` wrapping `createAgentSession()` from the pi SDK
- Add `src/agent-runner/index.ts` — factory that reads `config.agent.runner` and instantiates the correct runner
- Add `src/extensions/loader.ts` — wires `DefaultResourceLoader` with `~/.reeboot/` as `agentDir`; mounts bundled extensions at startup
- Bundle pi extensions from pi examples: `sandbox/`, `confirm-destructive.ts`, `protected-paths.ts`, `session-name.ts`, `custom-compaction.ts`
- Add custom bundled extension `extensions/scheduler-tool.ts` — registers `schedule_task` / `list_tasks` / `cancel_task` tool stubs (scheduler wired fully in Week 4)
- Add custom bundled extension `extensions/token-meter.ts` — tracks token usage per context → SQLite `usage` table
- Bundle skills: `skills/web-search/SKILL.md`, `skills/send-message/SKILL.md`
- Add WebSocket endpoint `WS /ws/chat/:contextId` to the Fastify server
- Add `src/webchat/index.html` — minimal built-in WebChat UI served at `GET /`
- Add context system: `src/context.ts` — manages AGENTS.md hierarchy, workspace directories, session lifecycle
- Expand REST API: `GET /api/contexts`, `POST /api/contexts`, `GET /api/contexts/:id/sessions`

## Capabilities

### New Capabilities

- `agent-runner`: Abstract `AgentRunner` interface + `PiAgentRunner` implementation wrapping the pi SDK
- `extension-loader`: `DefaultResourceLoader` wiring with bundled extensions and user extension discovery
- `websocket-chat`: WebSocket endpoint `WS /ws/chat/:contextId` with streaming protocol
- `webchat-ui`: Built-in minimal HTML/JS WebChat served at `GET /`
- `context-system`: Context directory structure, AGENTS.md hierarchy, session file management

### Modified Capabilities

- `http-server`: New routes added (`GET /`, `GET /api/contexts`, `POST /api/contexts`, `GET /api/contexts/:id/sessions`, `WS /ws/chat/:contextId`)

## Impact

- New runtime dependencies: `@mariozechner/pi-coding-agent` (already listed), `@fastify/websocket`, `@fastify/static`
- Bundled pi extensions from `pi` package examples — must be compatible with current pi SDK version
- WebSocket adds stateful connections to the server — graceful shutdown must drain in-flight agent turns
- Context workspace directories are created on first use at `~/.reeboot/contexts/<name>/`
