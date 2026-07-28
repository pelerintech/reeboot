# Beta-stabilisation

## Problem

Two deployment modes exist (pi/personal-assistant and ree/multi-user-support) but the ree mode is unreachable through any production deployment path because the Zod config schema silently drops `sdk` and `ree` fields. Several features are broken (cancel mechanism, WebSocket event streaming), untested (web-channel-routing integration), or missing (session_search in ree mode, SPA peer identity for concurrent connections). Uncommitted work for two in-flight requests (web-channel-routing, docker-integration-tests) must be landed to reach a stable baseline.

## Vision

After this change, both deployment modes (pi and ree) are reachable via the config file — the single source of truth — through either native install (`reeboot start`) or docker-compose with volume-mounted `config.json`. All existing tests pass. Cancel works reliably in both modes. The WebSocket streaming bridge correctly forwards RunnerEvents without duplication. The SPA generates per-connection peer IDs so concurrent connections don't collide. The entrypoint no longer has a confusing env-var config-generation path. `session_search` is available in ree mode, scoped to the current chat.

## Goals

- `sdk` (`"pi" | "ree"`) and `ree` config fields are declared in the Zod schema, persisted through `loadConfig`, and respected by `createRunner`
- The Docker entrypoint has one path: if `config.json` exists, start; if not, error and exit — no env-var-to-config translation
- Cancel messages from the WS client call `runner.abort()` — the `__cancel__` magic string is replaced with a proper bus protocol
- The WS handler's `wsSend` function correctly serializes `MessageContent` without fabricating duplicate events
- The web-channel-routing test file covers WS→bus integration, cancel flow, and history persistence
- The SPA generates a unique peer ID per WebSocket connection instead of using `contextId` as the peer identifier
- In ree mode, `session_search` queries the `chat_messages` table scoped to the current chat
- All REST API routes work correctly (return empty data where ree doesn't populate the backing tables, rather than crashing or misleading)
- All uncommitted changes from web-channel-routing and docker-integration-tasks are committed

## Non-goals

- Not changing the env-var-to-config wizard (`reeboot init` still uses it)
- Not adding dynamic chat routing (multiple concurrent contexts in ree mode) — each connection still talks to the same runner context; only the peer registration is fixed to prevent collisions
- Not building a ree-mode-specific SPA — the same SPA works for both modes
- Not changing how the core extension set works in ree mode (the 4-extension subset is unchanged)
- Not adding the `support-chat-routing` feature (deferred to its own request)

## Impact

- Config format gains two new top-level fields (`sdk`, `ree`) — existing pi-mode configs are unaffected (default `sdk: "pi"`)
- Docker entrypoint behaviour changes: a container started without a config file prints an error and exits instead of generating a config from env vars. Anyone relying on the env-var path must switch to volume-mounting a config file.
- WebSocket streaming bridge behaviour changes: duplicate `text_delta`/`message_end` events are eliminated (fixes a bug in uncommitted code)
- Cancel behaviour changes: previously did nothing (magic string was queued as a message), now properly aborts the running turn
- `session_search` becomes available in ree mode — queries the current chat's history instead of the global `messages` table
