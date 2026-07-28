## ADDED Requirements

### Requirement: WebChat UI is served at GET /
The Fastify server SHALL serve `src/webchat/index.html` at `GET /` via `@fastify/static` or `reply.sendFile`. The response SHALL have `Content-Type: text/html`.

#### Scenario: Root path returns HTML
- **WHEN** `GET /` is requested
- **THEN** response is HTTP 200 with `Content-Type: text/html` and the WebChat HTML content

### Requirement: WebChat connects to the WebSocket endpoint automatically
The `index.html` SHALL contain JavaScript that connects to `ws://<host>/ws/chat/main` (or the configured default context) on page load using the native WebSocket API. No external libraries or CDN dependencies are allowed — the UI must work fully offline.

#### Scenario: UI loads without external dependencies
- **WHEN** WebChat is opened with no internet connection
- **THEN** all UI elements render and the WebSocket connection can be established

### Requirement: WebChat displays streaming responses
The WebChat UI SHALL display the agent's response incrementally as `text_delta` events arrive. Each delta SHALL be appended to the current assistant message bubble. Tool call events SHALL be shown as collapsible indicators (tool name visible, args/result hidden by default).

#### Scenario: Text deltas append to message
- **WHEN** multiple `text_delta` events arrive for one turn
- **THEN** the assistant message bubble grows incrementally without flickering

### Requirement: WebChat supports send on Enter key
The input textarea SHALL submit the message when the user presses Enter (without Shift). Shift+Enter SHALL insert a newline.

#### Scenario: Enter sends message
- **WHEN** user types a message and presses Enter
- **THEN** the message is sent and the input is cleared

#### Scenario: Shift+Enter inserts newline
- **WHEN** user presses Shift+Enter
- **THEN** a newline is inserted into the input, message is not sent

### Requirement: WebChat disables input during an active agent turn
While an agent turn is in progress, the send button and Enter-to-submit SHALL be disabled. A cancel button SHALL appear, and clicking it SHALL send `{ type: "cancel" }` to the server.

#### Scenario: Input is disabled during agent turn
- **WHEN** agent turn is in progress
- **THEN** send button is disabled and input cannot be submitted

#### Scenario: Cancel button sends cancel event
- **WHEN** user clicks cancel during an active turn
- **THEN** `{ type: "cancel" }` is sent over the WebSocket
