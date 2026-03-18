## ADDED Requirements

### Requirement: WebSocket endpoint accepts connections on /ws/chat/:contextId
The Fastify server SHALL register a WebSocket route at `/ws/chat/:contextId` via `@fastify/websocket`. On connect, the server SHALL send `{ type: "connected", contextId, sessionId }`. The `contextId` must correspond to a known context; an unknown contextId SHALL result in immediate close with code 4004.

#### Scenario: Valid context connection is acknowledged
- **WHEN** a client connects to `/ws/chat/main`
- **THEN** the server sends `{ type: "connected", contextId: "main", sessionId: "<id>" }`

#### Scenario: Unknown context closes with error code
- **WHEN** a client connects to `/ws/chat/nonexistent`
- **THEN** the server closes the WebSocket with close code 4004

### Requirement: Client message triggers agent turn with streaming response
When the client sends `{ type: "message", content: "<text>" }`, the server SHALL call `runner.prompt(content, onEvent)`. Each `RunnerEvent` SHALL be forwarded to the client as a JSON message with the matching `type` field.

#### Scenario: Text delta is streamed to client
- **WHEN** client sends `{ type: "message", content: "hello" }` and agent produces a text delta
- **THEN** client receives `{ type: "text_delta", delta: "<text>" }` over the WebSocket

#### Scenario: Tool call events are forwarded
- **WHEN** the agent executes a tool during a turn
- **THEN** client receives `tool_call_start` then `tool_call_end` messages in order

#### Scenario: Message end is sent after turn completes
- **WHEN** the agent turn completes
- **THEN** client receives `{ type: "message_end", runId, usage: { input, output } }`

### Requirement: Client can cancel an in-flight turn
When the client sends `{ type: "cancel" }` during an active agent turn, the server SHALL call `runner.abort()` and send `{ type: "cancelled", runId }` to the client.

#### Scenario: Cancel aborts the current turn
- **WHEN** client sends `{ type: "cancel" }` while agent is running
- **THEN** server calls abort and sends `{ type: "cancelled", runId }` back

### Requirement: One active turn per context at a time
If a client sends a new message while a turn is already in-flight for the same context, the server SHALL respond with `{ type: "error", message: "Agent is busy. Cancel the current turn first." }` and not start a new turn.

#### Scenario: Concurrent message rejected while busy
- **WHEN** client sends a second message before the first turn completes
- **THEN** server sends `{ type: "error", message: "Agent is busy..." }` without starting a new turn

### Requirement: Authentication token is required for non-loopback connections
If `config.server.token` is set, WebSocket upgrade requests not from loopback addresses SHALL include `Authorization: Bearer <token>` or `?token=<token>` query parameter. Missing or invalid tokens SHALL result in HTTP 401 during the upgrade handshake.

#### Scenario: Valid token allows connection
- **WHEN** client includes correct `Authorization: Bearer <token>` header
- **THEN** WebSocket connection is established normally

#### Scenario: Missing token from non-loopback is rejected
- **WHEN** non-loopback client connects without a token and token auth is enabled
- **THEN** HTTP 401 is returned during upgrade
