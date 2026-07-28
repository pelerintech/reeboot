# Cancel signal — proper turn abort via bus

## Capability

Cancel messages trigger `runner.abort()` on the in-flight runner instead of being queued as normal messages.

## Scenarios

### S1: IncomingMessage has optional action: 'cancel' field

GIVEN a cancel message from the WS handler
WHEN `createIncomingMessage({ action: 'cancel', ... })` is called
THEN the resulting `IncomingMessage` has `action === 'cancel'`

### S2: Orchestrator detects cancel and aborts the running turn

GIVEN a context is busy processing a turn (state.busy === true)
WHEN an `IncomingMessage` with `action === 'cancel'` arrives for that context
THEN the orchestrator calls `runner.abort()` on the context's runner AND returns without queuing the message

### S3: Cancel does not interrupt a non-busy context

GIVEN a context is idle (state.busy === false)
WHEN an `IncomingMessage` with `action === 'cancel'` arrives for that context
THEN the orchestrator does NOT dispatch or queue — the cancel is silently ignored (nothing to cancel)

### S4: WS handler sends cancel via action field, not __cancel__ magic string

GIVEN a WebSocket message `{ type: "cancel" }` is received
WHEN the WS handler processes it
THEN it publishes `createIncomingMessage({ channelType: "web", peerId, content: "", raw: null, action: "cancel" })` — no `__cancel__` magic string is used

### S5: Cancelled event is sent to the WS client

GIVEN a cancel message is sent over the bus
WHEN the WS handler processes the cancel (before or after the bus publish)
THEN `{ type: "cancelled" }` is sent to the WebSocket client
