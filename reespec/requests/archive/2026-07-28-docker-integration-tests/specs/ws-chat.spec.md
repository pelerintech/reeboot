# Spec — WebSocket chat integration tests

## Capability

The WebSocket chat endpoint (`/ws/chat/:contextId`) accepts messages, runs the agent loop, and streams back events. Tests verify text responses, tool calls, multi-turn conversation, and abort.

## Scenarios

### S1: WebSocket connection establishes
- **GIVEN** the container is running and healthy
- **WHEN** a WebSocket connection is opened to `ws://localhost:3000/ws/chat/main`
- **THEN** the connection opens successfully
- **AND** a `connected` event is received with `contextId: "main"`

### S2: Text-only turn completes
- **GIVEN** a WebSocket connection is open
- **WHEN** a message `{ type: "message", content: "Say hello briefly", contextId: "main" }` is sent
- **THEN** one or more `text_delta` events are received
- **AND** a `message_end` event is received
- **AND** the accumulated text is non-empty

### S3: Tool call fires and completes
- **GIVEN** a WebSocket connection is open
- **WHEN** a message requesting a bash tool call is sent (e.g., "run bash: echo test")
- **THEN** a `tool_call_start` event is received with `toolName: "bash"`
- **AND** a `tool_call_end` event is received with matching `toolCallId`
- **AND** a `message_end` event is received

### S4: Multi-turn conversation works
- **GIVEN** a WebSocket connection is open
- **WHEN** message 1 "Remember my name is Alice" is sent and completes
- **WHEN** message 2 "What is my name?" is sent and completes
- **THEN** both turns complete with `message_end`
- **AND** the second turn's text contains "Alice" (model recalls context)

### S5: Abort cancels in-flight turn
- **GIVEN** a WebSocket connection is open
- **WHEN** a message is sent that triggers a long response
- **WHEN** an abort message `{ type: "abort", contextId: "main" }` is sent before `message_end`
- **THEN** no `message_end` event is received for that turn
- **AND** the connection remains open for subsequent messages

### S6: Concurrent chats are isolated (ree only)
- **GIVEN** the container is running with sdk=ree
- **WHEN** two WebSocket connections are opened to `/ws/chat/main` and `/ws/chat/test`
- **WHEN** both send messages simultaneously
- **THEN** both connections receive independent `message_end` events
- **AND** responses are delivered to the correct connection

### S7: Extension subset loads (ree only)
- **GIVEN** a WebSocket connection is open to sdk=ree
- **WHEN** a message "What tools do you have?" is sent
- **THEN** the response mentions tools (capabilities extension injected them)
- **AND** at least `bash`, `read`, `write` are referenced

### S8: Coding tools work (pi only)
- **GIVEN** a WebSocket connection is open to sdk=pi
- **WHEN** a message "read the file package.json" is sent
- **THEN** a `tool_call_start` event is received with `toolName: "read"`
- **AND** a `tool_call_end` event is received
- **AND** a `message_end` event is received
