# Web channel routing

## Goals

Route WebSocket chat messages through the MessageBus and Orchestrator — the same path every other channel (WhatsApp, Signal, Telegram) uses — so the web UI agent session is persistent and the LLM retains conversation history across messages.

## Non-goals

- Not changing the WebChat UI itself (React SPA)
- Not adding multiple conversation contexts or peer isolation within the web channel
- Not changing auth or token validation

## Impact

Currently the WS handler at `/ws/chat/:contextId` creates a fresh `PiAgentRunner` with an in-memory session on every message. The LLM sees each message as the first turn of a new conversation. History shown in the UI is purely client-side and has no server-side counterpart.

After this change, the WS handler publishes to the MessageBus. The Orchestrator routes the message to the persistent runner (created at startup with file-backed sessions), dispatches the turn, and replies through the WebAdapter. The agent retains full conversation history, session search, and memory across turns — identical to the WhatsApp experience.

## Key design decisions

- The existing `WebAdapter` (`src/channels/web.ts`) already implements `ChannelAdapter` and is registered in the `ChannelRegistry` at startup. No new channel type needed.
- The WS handler needs access to the `MessageBus` instance (currently scoped inside the `if (appConfig)` block). Hoist to module-level `_bus`.
- The `_activeRunners` Map and the ad-hoc `createRunner` call in the WS handler are removed — no more special-cased runner creation for web.
- The WebChat SPA passes a fixed `peerId` per connection (like a session ID generated on `onOpen`), so the orchestrator can distinguish between concurrent WS connections.
- The `WebAdapter.registerPeer()` / `unregisterPeer()` mechanism is already in place for routing replies back to the correct WS connection.
