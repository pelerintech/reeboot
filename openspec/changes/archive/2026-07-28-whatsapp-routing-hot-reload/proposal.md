## Why

The WebChat works end-to-end. The next step is to connect reeboot to the channel where people actually spend their time: WhatsApp. This change adds the WhatsApp channel adapter (Baileys v7), the `ChannelRegistry`, and the message routing layer that maps incoming messages to the right context. It also adds in-chat commands (`/new`, `/context`, `/status`, `/compact`), session lifecycle management (inactivity timeout, resume), and the hot-reload / graceful-restart flow.

## What Changes

- Add `src/channels/interface.ts` — `ChannelAdapter`, `MessageBus`, `ChannelConfig`, `ChannelStatus`, `MessageContent` interfaces
- Add `src/channels/registry.ts` — `ChannelRegistry`: self-registering adapter map; reads `channels.*.adapter` from config for custom external adapters
- Add `src/channels/whatsapp.ts` — Baileys v7 WhatsApp adapter implementing `ChannelAdapter`; QR code in terminal; auth persisted at `~/.reeboot/channels/whatsapp/auth/`
- Add `src/channels/web.ts` — thin adapter wrapping the existing WebSocket handler as a `ChannelAdapter` so it joins the registry and message bus
- Add `src/orchestrator.ts` — `Orchestrator`: receives messages from `MessageBus`, applies routing rules, dispatches to the correct context's `AgentRunner`
- Add message routing rules to config (`routing.default`, `routing.rules`)
- Add in-chat commands: `/new`, `/context <name>`, `/contexts`, `/status`, `/compact`
- Add session lifecycle: inactivity timeout (configurable, default 4h), session persistence/resume on restart
- Implement `reeboot reload` — calls `loader.reload()` on all active runners
- Implement `reeboot restart` — graceful stop (drain turns, close channels) then re-spawn

## Capabilities

### New Capabilities

- `channel-adapter-interface`: `ChannelAdapter`, `MessageBus`, and related types exported from `reeboot/channels`
- `channel-registry`: Self-registering adapter registry; supports custom adapter paths from config
- `whatsapp-adapter`: Baileys v7 WhatsApp adapter with QR login, auth persistence, auto-reconnect
- `message-router`: Routes messages from any channel to the correct context per routing rules
- `in-chat-commands`: `/new`, `/context`, `/contexts`, `/status`, `/compact` parsed and handled before agent dispatch
- `session-lifecycle`: Inactivity timeout, session file persistence and resume across restarts

### Modified Capabilities

- `cli-entrypoint`: `reeboot reload` and `reeboot restart` now fully implemented (stubs removed)
- `http-server`: `GET /api/channels` and `POST /api/channels/:type/login` and `POST /api/channels/:type/logout` routes added

## Impact

- New runtime dependency: `@whiskeysockets/baileys` v7
- WhatsApp adapter holds a persistent WebSocket connection — requires graceful shutdown in stop/restart flow
- `ChannelAdapter` interface is exported from `reeboot/channels` package export (types for external adapter authors)
- Routing rules shape is added to config Zod schema
