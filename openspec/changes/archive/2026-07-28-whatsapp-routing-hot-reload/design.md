## Context

Week 2 delivered WebChat. This change adds the first external messaging channel (WhatsApp) and the infrastructure that makes all future channels composable: the `ChannelAdapter` interface, `ChannelRegistry`, `MessageBus`, and `Orchestrator`.

The key insight is that the `Orchestrator` should not know about WhatsApp or WebSockets — it receives `IncomingMessage` objects from a `MessageBus`, routes them to contexts, and calls `AgentRunner.prompt()`. Channels publish to the bus; the orchestrator consumes from it. This is the same architecture as NanoClaw but typed end-to-end.

## Goals / Non-Goals

**Goals:**
- `ChannelAdapter` and `MessageBus` interfaces defined and exported from `reeboot/channels`
- `ChannelRegistry` with self-registering pattern; supports `adapter` path in config for custom adapters
- Baileys v7 WhatsApp adapter: QR login, multi-device auth, auto-reconnect, text/image send
- `Orchestrator` with routing rules (channel match, peer match, default)
- In-chat commands handled before agent dispatch
- Session inactivity timeout (4h default) — creates new session automatically
- `reeboot reload` calls `loader.reload()` on all active `PiAgentRunner` instances
- `reeboot restart` gracefully drains in-flight turns, stops channels, re-spawns process

**Non-Goals:**
- Signal adapter (Week 4)
- Credential proxy (Week 4)
- Scheduler (Week 4)

## Decisions

### MessageBus is an EventEmitter, not a queue
For Phase 1 (single process, personal use), an `EventEmitter`-based `MessageBus` is sufficient. Channels `emit('message', IncomingMessage)` and the orchestrator `on('message', handler)`. No message queue (Redis/RabbitMQ) needed at this scale.

### ChannelRegistry is a Map with self-registration
```typescript
const registry = new Map<string, () => ChannelAdapter>();
export function registerChannel(type: string, factory: () => ChannelAdapter) {
  registry.set(type, factory);
}
```
Built-in adapters call `registerChannel` at module load time. Custom adapters (from `config.channels.*.adapter`) are loaded with `tsx` dynamic import at startup. This matches the NanoClaw pattern.

### Routing rules: most-specific wins
Priority order: peer match > channel match > default. This is simple, predictable, and testable. The `/context <name>` in-chat command overrides routing for the current conversation session.

### Baileys v7 connection and auth
Baileys' multi-auth state is stored at `~/.reeboot/channels/whatsapp/auth/`. `makeWASocket({ auth: state, printQRInTerminal: true })` handles QR display automatically. The `connection.update` event drives reconnection logic. Baileys handles reconnection internally; the adapter just monitors and reports status.

### WhatsApp message handling: only process user messages
Baileys delivers ALL messages (sent by self, status updates, system messages). Filter: only process `messages.upsert` with `type: "notify"` and `msg.key.fromMe === false`. Extract text from `msg.message.conversation` or `msg.message.extendedTextMessage.text`.

### Sending long messages: chunk at 4096 chars
WhatsApp has message length limits. Responses longer than 4096 characters are split and sent as sequential messages with a short delay between them (100ms) to preserve order.

### In-chat commands: prefix `/`, parsed before agent dispatch
The orchestrator checks if content starts with `/` before calling the runner. Known commands: `/new` (reset session), `/context <name>` (switch context), `/contexts` (list contexts), `/status` (show context/model/usage), `/compact` (trigger pi session compaction). Unknown commands starting with `/` are passed through to the agent (the agent can respond to them).

### Session inactivity timeout
When a context receives no message for `config.session.inactivityTimeout` milliseconds (default: 4 hours), the current session is closed (runner disposed), and a new session will be created on the next message. Timer resets on each message. Timeout is managed by the orchestrator, not the runner.

### reeboot reload vs restart
`reload` calls `runner.reload()` → `loader.reload()` on all active runners. This picks up new `.ts` extension files and new `SKILL.md` files without interrupting sessions. Does NOT restart channel connections.
`restart` is a full process restart: drain in-flight agent turns (wait for `runner.prompt()` promises to settle or timeout at 30s), call `adapter.stop()` on all channels, then `process.exit(0)` and rely on a process supervisor (launchd/systemd/pm2) to restart. For development, a subprocess spawn approach is used.

## Risks / Trade-offs

- **Baileys v7 RC breaking changes**: Baileys v7 may have API changes before stable release. → Mitigation: pin exact version in `package.json`; write adapter against documented v7 API; keep adapter in a single file for easy auditing.
- **WhatsApp Terms of Service**: Baileys-based bots are a grey area for personal use. → This is intentional personal use only. The README will include a note. Not in scope for Phase 1 risk mitigation.
- **ChannelAdapter dynamic import for custom adapters**: Loading user-provided `.ts` files at runtime with `tsx` dynamic import could fail if the file has syntax errors. → Error is caught per-adapter; other channels continue running. `reeboot doctor` checks all configured adapter paths.
- **MessageBus EventEmitter backpressure**: If the agent is slow, inbound messages queue up. → For personal use with one user, this is not a practical problem. Add a "busy" reply to the channel if agent is already running a turn for that context.

## Open Questions

- Should we expose `ChannelAdapter` types from `package.json#exports` as `reeboot/channels` now? → **Decision**: Yes, add `"./channels": "./dist/channels/interface.js"` to exports. Enables external adapter authors to get types immediately. Document in architecture-decisions.
- Should reload also reconnect channels? → **Decision**: No. `reload` is for extensions/skills only. Channel reconnection requires a restart (adapters hold persistent connections). This distinction is important — document it.
