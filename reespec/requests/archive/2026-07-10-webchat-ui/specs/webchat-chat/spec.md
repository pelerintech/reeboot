# Spec — Webchat Chat

## Capability

Rich chat interface with streaming text, tool call visualization, and message history.

## Scenarios

### GIVEN a user opens the chat page
**WHEN** the page loads
**THEN** the chat panel connects to the WebSocket endpoint `/ws/chat/:contextId`
**AND** the connection status indicator shows "Connected"
**AND** the input field is enabled

### GIVEN a user is connected to the WebSocket
**WHEN** the user types a message and presses Enter
**THEN** the message is sent to the server via `ws.send(JSON.stringify({ type: 'message', content: '...' }))`
**AND** the user message is displayed in the chat with role="user"
**AND** the input field is cleared
**AND** the send button is disabled while the agent is processing

### GIVEN the user has sent a message
**WHEN** the server sends a `text_delta` event
**THEN** the assistant's response bubble appears with role="assistant"
**AND** the streaming text delta is appended to the assistant's message
**AND** the assistant message scrolls into view
**AND** a blinking cursor (▋) appears at the end of the streaming text

### GIVEN the agent is calling a tool
**WHEN** the server sends a `tool_call_start` event with `{ toolName: 'schedule_task', toolCallId: 'abc123' }`
**THEN** a collapsible tool call indicator appears in the chat with `⚙ schedule_task`
**AND** the tool call is associated with the current assistant message
**AND** clicking the tool call indicator expands it to show the result

### GIVEN the tool call has completed
**WHEN** the server sends a `tool_call_end` event with `{ toolCallId: 'abc123', result: 'Scheduled at...' }`
**THEN** the tool call indicator is expanded to show the result text
**AND** if `isError` is true, the tool call indicator is styled with error colors
**AND** the result text is truncated to 500 characters with "..." suffix if longer

### GIVEN the user has sent a message
**WHEN** the server sends a `message_end` event
**THEN** the assistant's streaming cursor disappears
**AND** the send button is re-enabled
**AND** the input field is re-enabled
**AND** the assistant message is no longer in "streaming" state

### GIVEN the agent is processing a message
**WHEN** the user clicks the "Cancel" button
**THEN** a `ws.send(JSON.stringify({ type: 'cancel' }))` is sent to the server
**AND** the input field is disabled
**AND** the cancel button is visible and disabled
**AND** if the server sends a `cancelled` event, a warning message is displayed: "⚠ Turn cancelled."

### GIVEN the server sends an `error` event
**WHEN** the client receives `{ type: 'error', message: '...' }`
**THEN** an error message is displayed with role="error-msg"
**AND** the error message shows "⚠ " prefix + the error message
**AND** the error message is centered in the chat with red styling
**AND** the send button is re-enabled

### GIVEN the WebSocket connection is lost
**WHEN** the server closes the connection (e.g., `ws.onclose`)
**THEN** the connection status indicator shows "Disconnected"
**AND** the send button is disabled
**AND** a retry message is displayed: "⚠ Connection lost. Retrying..."
**AND** the client attempts to reconnect after 1 second
**AND** on successful reconnect, the connection status returns to "Connected"
**AND** the retry message is removed

### GIVEN the user sends a message with multiple lines
**WHEN** the user presses Shift+Enter
**THEN** a newline is inserted in the input field
**AND** the input field auto-resizes to accommodate the text (up to 160px max height)

### GIVEN the user sends a message
**WHEN** the server processes the message and returns a response with markdown formatting
**THEN** the markdown is rendered in the assistant message (bold, italic, links, etc.)
**AND** code blocks are syntax-highlighted with a dark theme
**AND** the rendered markdown is displayed in the assistant message bubble

### GIVEN the user sends a message
**WHEN** the assistant's response includes tool call arguments
**THEN** the tool call indicator shows the tool name (e.g., "⚙ schedule_task")
**AND** expanding the tool call shows the arguments in a formatted JSON block
**AND** the arguments are truncated if too long (>500 chars) with "..." suffix
