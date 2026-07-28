# Web channel routing — design

## Current architecture

```
WS client                    server.ts WS handler
   │                              │
   │  /ws/chat/main               │ createRunner() → new PiAgentRunner
   │                              │   → SessionManager.inMemory()
   │                              │   → prompt() → fresh session every message
   │                              │   → discard runner
   ▼                              ▼
[UI shows history           [LLM sees single-turn; no memory of
 client-side only]            previous messages in same WS session]
```

Every other channel:

```
WhatsApp/Signal              channel adapter
   │                              │
   │  incoming message            │ bus.publish()
   │                              ▼
   │                      MessageBus ──→ Orchestrator._handleMessage()
   │                                          │
   │                                          │ _runTurn()
   │                                          │   → runner.prompt()
   │                                          │     (reuses persistent session
   │                                          │      with file-backed SessionManager)
   │                                          │
   │                              ────────────┘
   │                              │
   │                      adapter.send() ← reply
```

## Target architecture

```
WS client                    WebAdapter (web.ts)
   │                              │
   │  /ws/chat/:contextId         │ registerPeer(sessionId, sendFn)
   │  { type: "message", ... }    │ bus.publish({ channelType: "web", peerId: sessionId })
   │                              ▼
   │                      MessageBus ──→ Orchestrator._handleMessage()
   │                                          │
   │                                          │ → resolves context by routing rule
   │                                          │ → dispatches to persistent runner
   │                                          │ → reply via WebAdapter.send(sessionId)
   │                              ────────────┘
   │                              │
   │  stream of RunnerEvents      │ WebAdapter registered send function
   │  ← text_delta, tool_call_*   │
```

## Changes

### 1. Hoist `_bus` to module level in server.ts

Currently `bus` is a `const` inside the `if (appConfig)` block (line 189). Promote to `let _bus: MessageBus | null = null` at module level alongside the other module-level refs.

### 2. Rewrite WS handler to publish to bus

Replace the ad-hoc `createRunner()` / `_activeRunners` code with:

- `onOpen`: generate a `sessionId` (already done via `nanoid()`), call `webAdapter.registerPeer(sessionId, sendFn)`  
- `onMessage` with `type: "message"`: call `_bus.publish(createIncomingMessage({ channelType: "web", peerId: sessionId, content, raw: null }))`
- `onMessage` with `type: "cancel"`: call `_bus.publish(...)` with an abort mechanism — either a dedicated IncomingMessage convention (e.g., `content: "__cancel__"` in the raw field) or a direct `runner.abort()` if we keep a reference. The simplest approach: publish a cancellation message that the orchestrator recognises.
- `onClose`: call `webAdapter.unregisterPeer(sessionId)`

### 3. Remove `_activeRunners` and ad-hoc runner creation

The `_activeRunners` Map and the `createRunner`/`runner.prompt()`/`_activeRunners.delete()` code in the WS handler are no longer needed. The orchestrator owns all runners.

### 4. Handle streaming replies

The current WS handler streams RunnerEvents (text_delta, tool_call_start, etc.) directly from `runner.prompt(onEvent)`. When routing through the bus, the reply path is:
- Orchestrator runs the turn via the persistent runner
- Runner events (text_delta, etc.) are streamed through the runner's existing onEvent callback
- The orchestrator's `_reply()` sends the final text response through `adapter.send()`

However, the WebChat SPA expects **streaming events** (text_delta for real-time token display, tool_call_start/end for tool call UI). The current `WebAdapter.send()` only supports final `{ type: 'text', text }` messages — it doesn't stream intermediate events.

**Two approaches:**

**A. Extend WebAdapter to stream RunnerEvents.** The WS handler registers a streaming callback alongside the send function. The orchestrator calls it for each event during turn execution. This matches the current UX (real-time token display).

**B. Only send final response.** Simplify WebAdapter.send() to deliver the complete response. The WebChat SPA would need modification to handle non-streaming responses (it currently expects streaming events). This is simpler on the server but degrades UX.

**Chosen: Approach A** — The WebChat already expects streaming. The WebAdapter gains a per-peer `onEvent` callback registered alongside the send function. The orchestrator or a bridge layer forwards `onEvent` calls through the adapter during turn execution.

### 5. Cancel support

The current "cancel" flow calls `runner.abort()` directly. After the change, cancel publishes a cancellation message on the bus. The orchestrator's `_handleMessage` recognises a cancel signal (e.g., `msg.content === '__cancel__'`), looks up the in-flight turn's runner, and calls `runner.abort()`.

Alternatively, the WS handler keeps a lightweight `activeTurn` tracker so cancel can still call `runner.abort()` without going through the bus. This is simpler and avoids introducing cancel routing logic into the orchestrator.

**Chosen: Keep cancel direct.** The WS handler maintains a `Map<sessionId, AbortController>` for in-flight turns. Cancel calls abort on the controller — the runner's `prompt()` checks the signal and throws `AbortError`, which the orchestrator catches cleanly.

## Open questions

- How does the WebChat SPA differentiate its messages from others when the same context is used? Currently the WS connection endpoint is `/ws/chat/main`. With routing through the bus, multiple WS connections to the same context would share the same runner/session. The peerId (sessionId) distinguishes them for reply routing, but they share the same pi session context (history). This matches how WhatsApp works — one conversation per context.
