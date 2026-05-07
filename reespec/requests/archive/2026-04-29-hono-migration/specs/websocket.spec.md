# Spec: WebSocket Chat

## Capability
The `/ws/chat/:contextId` WebSocket endpoint accepts connections, enforces auth, validates context, and enables bidirectional message streaming with run lifecycle management.

## Scenarios

### Scenario: Valid context receives connected message

GIVEN the server is running
WHEN a WebSocket connects to `/ws/chat/main`
THEN the first message is `{ type: 'connected', contextId: 'main', sessionId: <string> }`

### Scenario: Unknown context closes connection with 4004

GIVEN the server is running
WHEN a WebSocket connects to `/ws/chat/nonexistent-ctx`
THEN the connection is closed with WebSocket close code 4004

### Scenario: Token auth enforced for non-loopback connections

GIVEN `serverToken` is configured
AND the connection is from a non-loopback IP
WHEN a WebSocket connects without a valid token
THEN the connection is closed with code 1008 (Unauthorized)

### Scenario: Valid token allows connection

GIVEN `serverToken` is configured
AND the connection provides a valid token via `?token=<token>` or `Authorization: Bearer <token>`
WHEN a WebSocket connects
THEN the connection is accepted and `connected` message is received

### Scenario: Loopback connections bypass token check

GIVEN `serverToken` is configured
AND the connection is from `127.0.0.1` or `::1`
WHEN a WebSocket connects without a token
THEN the connection is accepted

### Scenario: Message type 'message' triggers agent turn

GIVEN a connected WebSocket
WHEN `{ type: 'message', content: 'hello' }` is sent
THEN the agent processes the turn
AND streaming events are sent back over the WebSocket

### Scenario: Busy message rejected

GIVEN a turn is already in progress for the context
WHEN `{ type: 'message', content: 'second' }` is sent
THEN `{ type: 'error', message: 'Agent is busy...' }` is returned

### Scenario: Message type 'cancel' aborts active turn

GIVEN a turn is in progress
WHEN `{ type: 'cancel' }` is sent
THEN the runner's `abort()` is called
AND `{ type: 'cancelled', runId: <id> }` is sent

### Scenario: Close disconnects and aborts runner

GIVEN a turn is in progress
WHEN the WebSocket closes
THEN any active runner for the context is aborted

### Scenario: Invalid JSON receives error

GIVEN a connected WebSocket
WHEN non-JSON text is sent
THEN `{ type: 'error', message: 'Invalid JSON' }` is returned
