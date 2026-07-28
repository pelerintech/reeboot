# Web channel routing — tasks

## 1. Hoist _bus to module level in server.ts

- [x] **RED** — Check: `server.ts` has `const bus = new MessageBus()` inside `if (appConfig)` block (line ~189). The WS handler at line ~680 cannot access `bus`. Assertion fails — WS handler has no access to the bus.
- [x] **ACTION** — Add `let _bus: MessageBus | null = null` at module level. Change `const bus =` to `_bus =` inside the `if (appConfig)` block. Adjust downstream references (bus → _bus) in the same block: `MessageBus` import is already hoisted; the `new MessageBus()` and all `bus.publish()` calls update to `_bus.publish()`.
- [x] **GREEN** — Verify: `_bus` is declared at module level, assigned inside `if (appConfig)`, and `tsc --noEmit` compiles cleanly.

## 2. Expose WS send function via WebAdapter event-streaming bridge

The WebAdapter currently stores a `sendFn` per peer for final `MessageContent` delivery. For the WebChat streaming UX, we need to also forward RunnerEvents (text_delta, tool_call_start, tool_call_end, message_end) to the WS client during turn execution.

- [x] **RED** — Check: `WebAdapter.registerPeer()` accepts only `(peerId, sender)`. There is no mechanism to stream RunnerEvents to a peer. Assertion fails — no streaming bridge exists.
- [x] **ACTION** — Add an optional `onEvent` callback to `registerPeer`: `registerPeer(peerId: string, sender: (content: MessageContent) => Promise<void>, onEvent?: (event: RunnerEvent) => void): void`. Store it in a `Map<string, (event: RunnerEvent) => void>`. Add `sendEvent(peerId: string, event: RunnerEvent): void` method that looks up the peer's `onEvent` callback and calls it.
- [x] **GREEN** — Verify: `WebAdapter` has `sendEvent()` method, `registerPeer` accepts third parameter, stored callbacks are invoked. Run existing tests: `npx vitest run tests/channels/ --reporter=verbose` passes.

## 3. Rewrite WS handler to publish to bus (remove ad-hoc runner creation)

- [x] **RED** — Write `tests/web-channel-routing.test.ts`: 
  - Connect WS to `/ws/chat/main`, receives `{ type: "connected", sessionId }`
  - Send `{ type: "message", content: "hello" }` 
  - Assert no `createRunner` is called (mock it) — instead assert `_bus.publish` was called with `channelType: "web"`
  - Run test → it fails because WS handler still calls `createRunner`

- [x] **ACTION** — In the WS handler's `onMessage` for `type: "message"`:
  - Remove the `createRunner()` call, `_activeRunners` set/delete, and the `runner.prompt()` try/catch
  - Import `createIncomingMessage` at the top of server.ts (not inlined)
  - Call `_bus?.publish(createIncomingMessage({ channelType: "web", peerId: sessionId, content: msg.content, raw: null }))`
  - The reply will come through the WebAdapter's send function and sendEvent mechanism
  - Keep cancel handling: `onMessage` for `type: "cancel"` can call `runner.abort()` if we keep a lightweight abort controller map, OR publish a cancel message. For simplicity, maintain a `Map<sessionId, AbortController>` for in-flight turns; cancel calls `controller.abort()`.
  - On `onOpen`, generate `sessionId` (already done) and register both `send` and `onEvent` via `webAdapter.registerPeer(sessionId, sendFn, eventFn)`
  - On `onClose`, call `webAdapter.unregisterPeer(sessionId)`

- [x] **GREEN** — Run `npx vitest run tests/web-channel-routing.test.ts` → test passes.

## 4. Forward RunnerEvents through WebAdapter during orchestrator turn execution

The orchestrator's `_runTurn` defines an `onEvent` callback that accumulates text for `_reply()`. For the web channel, we need these events forwarded live to the peer.

- [x] **RED** — Write test in `tests/web-channel-routing.test.ts`:
  - Given a mock WebAdapter with a registered peer
  - When orchestrator processes a message from `channelType: "web"`
  - Then `webAdapter.sendEvent()` is called for each `text_delta`, `tool_call_start`, `tool_call_end`, `message_end` during turn execution
  
- [x] **ACTION** — In `orchestrator.ts` `_runTurn()`, modify the `onEvent` callback to also forward events to the channel adapter when the adapter supports streaming:
  - After the event processing in `onEvent`, call `adapter.sendEvent?.(msg.peerId, event)` if the adapter exposes a `sendEvent` method
  - The `presenceAdapter` variable (line ~305) already resolves `this._adapters.get(msg.channelType)` — use it, but check for optional `sendEvent`

- [x] **GREEN** — Run `npx vitest run tests/web-channel-routing.test.ts` → test passes. Also run full test suite: `npx vitest run --reporter=verbose` passes.

## 5. Verify agent retains conversation history across web messages

This is an integration-level verification — the orchestrator's runner is created once at startup with file-backed sessions, so history is automatically retained. This task verifies the end-to-end result.

- [x] **RED** — Write integration test in `tests/web-channel-routing.test.ts`:
  - Start server with a mock model that records conversation history
  - Connect WS, send first message "ping", receive response
  - Send second message "what was the first message I sent?"
  - Assert the second response contains "ping" or otherwise references the first message
  - Run test → it fails because runner is still in-memory

- [x] **ACTION** — No separate code change needed — tasks 3 and 4 already route through the orchestrator with persistent runners. This task's RED confirms the integration works.
- [x] **GREEN** — Run `npx vitest run tests/web-channel-routing.test.ts` → test passes confirming history is retained.

## 6. Remove stale code

- [x] **RED** — Check: `server.ts` still has `_activeRunners` Map declaration and references (line ~77). Assertion fails — stale code exists.
- [x] **ACTION** — Remove `_activeRunners` Map. Remove the ad-hoc `createRunner` import and call in the WS handler. Remove the `runId` generation (no longer needed in WS handler). Remove the `{ defaultConfig }` import inside the WS handler block.
- [x] **GREEN** — Verify: `_activeRunners` no longer exists in `server.ts`. `tsc --noEmit` compiles cleanly. Run `npx vitest run tests/ --reporter=verbose` passes.
