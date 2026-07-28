# Web channel routing

## Capability: WS handler publishes to bus

**ID**: web-routing-1

Given a WebSocket client connects to `/ws/chat/main`  
When it sends `{ type: "message", content: "hello" }`  
Then the WS handler calls `_bus.publish()` with an `IncomingMessage` having `channelType: "web"`, `peerId` set to the session ID, and `content: "hello"`

---

**ID**: web-routing-2

Given a WebSocket client connects to `/ws/chat/main`  
When it sends `{ type: "cancel" }`  
Then the current in-flight prompt is aborted  
And a `{ type: "cancelled" }` response is sent to the WS client

---

**ID**: web-routing-3

Given a WebSocket client connects and receives a `sessionId` in the `connected` event  
When the WS handler publishes a message to the bus  
Then the `peerId` in the `IncomingMessage` equals the `sessionId`

---

**ID**: web-routing-4

Given a WebSocket client connects to `/ws/chat/main`  
When the client disconnects (`onClose`)  
Then `webAdapter.unregisterPeer(sessionId)` is called

## Capability: WebAdapter streams RunnerEvents

**ID**: web-routing-5

Given a WebSocket client is connected with a `sendFn` and an `onEvent` callback registered via `webAdapter.registerPeer(sessionId, sendFn, onEvent)`  
When the orchestrator calls `onEvent({ type: "text_delta", delta: "Hello" })` during turn execution  
Then the WS client receives `{ type: "text_delta", delta: "Hello" }`

---

**ID**: web-routing-6

Given a WebSocket client is connected  
When the orchestrator's `_reply()` calls `webAdapter.send(sessionId, { type: "text", text: "final answer" })`  
Then the WS client receives `{ type: "text_delta", delta: "final answer" }`  
And subsequently receives `{ type: "message_end", runId: "...", usage: {...} }`

## Capability: Agent retains conversation history

**ID**: web-routing-7

Given a WebSocket client sends a first message "What is my name?"  
When the LLM responds  
Then the next message "What did I just ask you?" returns an answer that references the previous question

## Capability: WebAdapter send delivers to correct peer

**ID**: web-routing-8

Given two WebSocket clients (peerA, peerB) are connected  
When the orchestrator replies to peerA via `webAdapter.send(peerA, content)`  
Then only peerA receives the message  
And peerB does not receive it
