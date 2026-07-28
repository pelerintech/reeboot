# SPA — per-connection peer ID

## Capability

Each WebSocket connection gets a unique peer ID for reply routing, preventing collisions between concurrent connections.

## Scenarios

### S1: Server generates a unique sessionId per WS connection

GIVEN a WebSocket client connects to `/ws/chat/main`
WHEN the WS handler's `onOpen` fires
THEN a unique `sessionId` (via `nanoid()`) is generated for this connection
AND `webAdapter.registerPeer(sessionId, ...)` is called with that ID (not `contextId`)
AND the connected event `{ type: "connected", contextId, sessionId }` is sent to the client

### S2: Two concurrent WS connections have different peer registrations

GIVEN two WebSocket clients connect simultaneously to the same URL
WHEN both are registered
THEN each has a different `sessionId` AND `webAdapter._eventCallbacks` has two separate entries (one per peer)

### S3: Disconnecting a peer removes only that peer's registration

GIVEN two concurrent WS connections with different sessionIds
WHEN one connection closes
THEN only that peer's registration is removed from WebAdapter — the other peer's registration is unaffected

### S4: Messages are routed to the correct peer

GIVEN two concurrent WS connections with different sessionIds
WHEN the orchestrator processes a message from peerId "abc"
THEN `webAdapter.sendEvent("abc", event)` reaches only the connection with sessionId "abc"
AND `webAdapter.sendEvent("def", event)` reaches only the connection with sessionId "def"
