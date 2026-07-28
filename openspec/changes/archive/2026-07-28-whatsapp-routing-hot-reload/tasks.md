## 1. Channel Adapter Interface

- [x] 1.1 Write failing tests: ChannelAdapter types importable from reeboot/channels, IncomingMessage shape, ChannelStatus values (TDD red)
- [x] 1.2 Implement `src/channels/interface.ts` — `ChannelAdapter`, `MessageBus`, `ChannelConfig`, `ChannelStatus`, `MessageContent`, `IncomingMessage`
- [x] 1.3 Add `"./channels": "./dist/channels/interface.js"` to `package.json#exports`
- [x] 1.4 Verify interface tests pass (TDD green)

## 2. Channel Registry

- [x] 2.1 Write failing tests: built-in adapters available after import, unregistered returns undefined, custom adapter loaded from config path, load error doesn't crash, initChannels starts only enabled adapters (TDD red)
- [x] 2.2 Implement `src/channels/registry.ts` — `ChannelRegistry`, `registerChannel()`, `initChannels()`
- [x] 2.3 Implement `src/channels/web.ts` — thin `ChannelAdapter` wrapping existing WebSocket handler; register as "web"
- [x] 2.4 Verify registry tests pass (TDD green)

## 3. WhatsApp Adapter

- [x] 3.1 Write failing tests: QR displayed on first connect, saved auth loaded without QR, incoming text emitted on bus, own messages ignored, short message sent as single call, long message chunked, non-logout reconnects, logout sets error status (TDD red)
- [x] 3.2 Install `@whiskeysockets/baileys@^7` dependency; pin exact version in package.json
- [x] 3.3 Implement `src/channels/whatsapp.ts` — `WhatsAppAdapter implements ChannelAdapter`; Baileys multi-device auth, message filtering, send chunking, reconnection logic
- [x] 3.4 Implement `reeboot channels login whatsapp` CLI action — login-only mode
- [x] 3.5 Verify WhatsApp adapter tests pass (TDD green — use Baileys mock where needed)

## 4. Orchestrator & Message Router

- [x] 4.1 Write failing tests: peer match wins, channel match fallback, default fallback, reply via originating channel, busy context queues message, queue limit sends "queue full", queued message processed after turn (TDD red)
- [x] 4.2 Implement `src/orchestrator.ts` — `Orchestrator` class; subscribe to MessageBus; routing rule resolution; per-context runner map; per-context message queue (max 5)
- [x] 4.3 Wire orchestrator into `reeboot start` flow: init channels → init orchestrator → subscribe to bus → start server
- [x] 4.4 Verify orchestrator tests pass (TDD green)

## 5. In-Chat Commands

- [x] 5.1 Write failing tests: /new resets session, /context switches routing, /contexts lists contexts, /status shows info, /compact triggers compaction, unknown slash forwarded to agent, commands work channel-agnostically (TDD red)
- [x] 5.2 Implement command parser in orchestrator — check `/` prefix, dispatch to handler functions
- [x] 5.3 Implement each command handler: `handleNew`, `handleContext`, `handleContexts`, `handleStatus`, `handleCompact`
- [x] 5.4 Verify in-chat command tests pass (TDD green)

## 6. Session Lifecycle

- [x] 6.1 Write failing tests: session resumed within inactivity window, not resumed after timeout, inactivity timer resets on message, session closed after timeout, reload doesn't interrupt turn, restart waits for turn then exits 0, restart times out at 30s (TDD red)
- [x] 6.2 Implement inactivity timer in orchestrator — per-context setTimeout; reset on message; dispose runner on expiry
- [x] 6.3 Implement session resume logic in context system — check session file age vs inactivity timeout
- [x] 6.4 Implement `reeboot reload` — send IPC/signal to running process to call `runner.reload()` on all runners
- [x] 6.5 Implement `reeboot restart` — graceful drain (30s timeout), stop channels, dispose runners, exit 0
- [x] 6.6 Verify session lifecycle tests pass (TDD green)

## 7. Channel REST API

- [x] 7.1 Write failing tests: GET /api/channels shape, POST /api/channels/whatsapp/login returns 202, unknown type 404, POST logout returns 200 (TDD red)
- [x] 7.2 Implement `GET /api/channels` route
- [x] 7.3 Implement `POST /api/channels/:type/login` route
- [x] 7.4 Implement `POST /api/channels/:type/logout` route
- [x] 7.5 Verify channel API tests pass (TDD green)

## 8. Integration & Architecture Update

- [x] 8.1 Run full test suite — all tests pass
- [x] 8.2 End-to-end smoke test: connect WhatsApp, send message, receive reply
- [x] 8.3 Update `architecture-decisions.md` — document MessageBus EventEmitter pattern, ChannelRegistry self-registration, routing rule priority order, reload vs restart distinction (reload = extensions only, restart = channels + process), Baileys version pinned, message queue depth limit, `reeboot/channels` export added
