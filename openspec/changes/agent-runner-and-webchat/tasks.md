## 1. AgentRunner Interface & PiAgentRunner

- [x] 1.1 Write failing tests: interface types are importable, factory creates PiAgentRunner for "pi" config, unknown runner throws (TDD red)
- [x] 1.2 Implement `src/agent-runner/interface.ts` — `RunnerEvent`, `AgentRunner`, `AgentRunnerFactory`
- [x] 1.3 Write failing tests for PiAgentRunner: text_delta forwarded, tool events forwarded, message_end resolves promise, abort cancels turn, dispose idempotent, reload triggers loader.reload() (TDD red)
- [x] 1.4 Implement `src/agent-runner/pi-runner.ts` — `PiAgentRunner` wrapping pi `createAgentSession()`; read pi SDK source to determine exact event field names and document the mapping in a comment
- [x] 1.5 Implement `src/agent-runner/index.ts` — `createRunner(context, config)` factory
- [x] 1.6 Verify all agent-runner tests pass (TDD green)

## 2. Extension Loader

- [x] 2.1 Write failing tests: loader uses ~/.reeboot as agentDir, bundled extensions loaded without user config, sandbox excluded when disabled, git-checkpoint excluded by default, user extension available after reload (TDD red)
- [x] 2.2 Copy bundled pi extensions from pi SDK examples into `extensions/` directory: `sandbox/`, `confirm-destructive.ts`, `protected-paths.ts`, `session-name.ts`, `custom-compaction.ts`
- [x] 2.3 Implement `extensions/scheduler-tool.ts` — register `schedule_task`, `list_tasks`, `cancel_task` tool stubs returning "not yet implemented"
- [x] 2.4 Implement `extensions/token-meter.ts` — subscribe to agent_end events, insert row into `usage` table via `getDb()`
- [x] 2.5 Create `skills/web-search/SKILL.md` and `skills/send-message/SKILL.md` with appropriate frontmatter and instructions
- [x] 2.6 Implement `src/extensions/loader.ts` — `createLoader(contextConfig, config)` returning configured `DefaultResourceLoader`; respect `config.extensions.core.*` toggle flags
- [x] 2.7 Verify all extension loader tests pass (TDD green)

## 3. Context System

- [x] 3.1 Write failing tests: main context workspace created on startup, existing AGENTS.md not overwritten, session file path is deterministic, context persisted in DB, context list returned from DB (TDD red)
- [x] 3.2 Implement `src/context.ts` — `initContexts(config)`, `getActiveSessionPath(contextId)`, `createContext(name, modelProvider, modelId)`, `listContexts()`, `listSessions(contextId)`
- [x] 3.3 Verify all context system tests pass (TDD green)

## 4. WebSocket Chat Endpoint

- [x] 4.1 Write failing tests: valid context gets connected message, unknown context closes 4004, text_delta forwarded, tool events forwarded, message_end sent, cancel triggers abort, concurrent message rejected, token auth required for non-loopback (TDD red)
- [x] 4.2 Install `@fastify/websocket` dependency
- [x] 4.3 Implement `WS /ws/chat/:contextId` route in `src/server.ts` with full streaming protocol
- [x] 4.4 Wire active runner map (contextId → AgentRunner) for busy-check and cancel support
- [x] 4.5 Implement auth middleware for WebSocket upgrade (token from header or query param)
- [x] 4.6 Update `stopServer()` to abort all active runners before closing
- [x] 4.7 Verify all WebSocket tests pass (TDD green)

## 5. REST API Additions

- [x] 5.1 Write failing tests: GET /api/contexts returns array, POST /api/contexts creates context, GET /api/contexts/:id/sessions returns sessions, 404 for unknown context (TDD red)
- [x] 5.2 Implement `GET /api/contexts` route
- [x] 5.3 Implement `POST /api/contexts` route with validation
- [x] 5.4 Implement `GET /api/contexts/:id/sessions` route
- [x] 5.5 Verify all REST API tests pass (TDD green)

## 6. Built-in WebChat UI

- [x] 6.1 Implement `src/webchat/index.html` — self-contained HTML/JS WebChat; connects to `/ws/chat/main`, streams text_delta, shows tool indicators, Enter to send, Shift+Enter for newline, cancel button during turn
- [x] 6.2 Install `@fastify/static` and wire `GET /` to serve `index.html`
- [x] 6.3 Manual smoke test: start server, open browser, send message, verify streaming response

## 7. Integration & Architecture Update

- [x] 7.1 Run full test suite — all tests pass
- [x] 7.2 End-to-end smoke test: `reeboot start` → open http://localhost:3000 → send "hello" → receive streaming response
- [x] 7.3 Update `architecture-decisions.md` — document exact pi SDK event field names used in PiAgentRunner, confirm DefaultResourceLoader agentDir/cwd split, note reload() on runner pattern, document @fastify/websocket approach
