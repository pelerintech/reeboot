# Web-channel-routing integration tests

## Capability

The web-channel-routing test suite covers WS→bus integration, cancel flow, and history persistence.

## Scenarios

### S1: WS handler publishes messages to the bus

GIVEN a WebSocket client connects and sends `{ type: "message", content: "hello" }`
WHEN the WS handler processes the message
THEN `_bus.publish()` is called with an `IncomingMessage` with `channelType: "web"` and `content: "hello"`
AND no `createRunner()` call is made (the orchestrator's persistent runners handle the turn)

### S2: WS handler sends cancel via action field

GIVEN a WebSocket client sends `{ type: "cancel" }`
WHEN the WS handler processes the message
THEN `_bus.publish()` is called with `action: "cancel"` AND `{ type: "cancelled" }` is sent on the WebSocket
AND no magic string `__cancel__` is used

### S3: History persisted across two web messages

GIVEN a mocked runner that records conversation
WHEN two messages are sent sequentially via the bus
THEN the same runner is used for both messages (not a new runner per message)
AND the second turn's content includes the context of the first turn

### S4: Orchestrator forwards RunnerEvents through WebAdapter.sendEvent

GIVEN an orchestrator processes a message from `channelType: "web"`
WHEN the runner emits `text_delta`, `tool_call_start`, `tool_call_end` events during turn execution
THEN `webAdapter.sendEvent()` is called for each event with the correct peerId
