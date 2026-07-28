# WS streaming — no duplicate events

## Capability

The WebSocket streaming bridge does not produce duplicate `text_delta` or `message_end` events. Streaming events deliver content incrementally, and the final reply does not fabricate additional events.

## Scenarios

### S1: wsSend is a no-op (streaming events deliver everything)

GIVEN the WS handler registers a peer
WHEN the orchestrator calls `adapter.send(peerId, content)` during turn completion
THEN the `wsSend` function does NOT produce any WebSocket messages — it returns without sending

GIVEN the orchestrator's `onEvent` callback fires `text_delta`, `tool_call_start`, `tool_call_end`, `message_end`
WHEN these events pass through `webAdapter.sendEvent(peerId, event)`
THEN each event results in exactly one WebSocket `send()` call with the correct JSON serialization

### S2: SPA receives one text_delta per chunk, one message_end on completion

GIVEN a turn produces N text_delta events and one message_end event
WHEN the SPA receives these through the WebSocket
THEN there are exactly N `text_delta` events and 1 `message_end` event — no duplicates, no synthetic events

### S3: Tool call events are forwarded correctly

GIVEN a turn produces a tool_call_start and tool_call_end
WHEN the SPA receives these events
THEN they have the correct `toolCallId`, `toolName`, and `result` fields matching the runner's output
