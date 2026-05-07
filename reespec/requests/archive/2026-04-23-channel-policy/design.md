# Design: Channel Policy Layer

## Architecture

```
                    config.json
                         │
                         ▼
              ┌──────────────────────┐
              │   ChannelPolicyLayer │  ← new, wraps external channels
              │                      │
              │  owner_id            │  resolves owner identity
              │  owner_only          │  gates inbound messages
              │  __system__ resolve  │  maps to owner address on send
              └──────────┬───────────┘
                         │ wraps
              ┌──────────▼───────────┐
              │   Channel Adapter    │  ← lean: transport + protocol only
              │                      │
              │  fromSelf resolution │  "did this come from our account?"
              │  echo deduplication  │  suppress own-sent message echoes
              │  connect / transport │
              └──────────────────────┘
                         │
                    MessageBus
                         │
                    Orchestrator
```

## Channel Contract — Two Tiers

### Tier 1: External Messaging Channels
WhatsApp, Signal, Telegram, Slack, Discord

**Inbound**
- Publish only messages with non-empty text content
- Set `fromSelf: true` on `IncomingMessage` when the message originates from the
  agent's own account (protocol-specific: `fromMe` on WA, `syncMessage` on Signal)
- Deduplicate echoes: messages sent via `send()` that echo back must be suppressed
  before publishing to the bus
- Log every received message and every skipped/empty message with channel prefix

**Outbound**
- `send()` must return silently (not throw) when status is not `'connected'`
- Chunk messages exceeding the protocol's character limit with a delay between chunks

**Lifecycle**
- `init()` must transition status to `'initialising'`
- `status()` must reflect actual connection state — never optimistic
- `stop()` must prevent reconnection and clean up all timers and sockets

**Policy — must NOT be in the channel**
- owner_id matching
- owner_only gating
- trusted_senders evaluation
- `__system__` sentinel resolution

### Tier 2: Local Interface Channels
Web, CLI

**Inbound**
- All messages are implicitly from the owner — no identity verification required
- No echo deduplication required

**Outbound**
- `send()` must return silently when status is not `'connected'`
- `send('__system__', ...)` must broadcast to ALL connected peers

**Lifecycle**
- Same as Tier 1: `init()` → `'initialising'`, stop() cleans up, status reflects reality

## Owner Identity Model

```
Config field: owner_id (per external channel, optional)

Mode 1 — self-chat (owner_id absent)
  Owner = messages where fromSelf === true
  Used when agent runs on YOUR own account
  Current WhatsApp usage

Mode 2 — dedicated account (owner_id present)
  Owner = messages where peerId === owner_id
  Used when agent runs on a separate account
  Production deployment model

Mode 3 — trusted users (future, architecture must accommodate)
  trusted_senders list acts as secondary allowlist
  These senders are treated as owner-equivalent
  NOT implemented in this request
```

The policy layer checks in order:
1. If `fromSelf === true` AND `owner_id` absent → owner (Mode 1)
2. If `peerId === owner_id` → owner (Mode 2)
3. If `owner_only === true` → drop
4. Otherwise → pass through (future: check trusted_senders for Mode 3)

## fromSelf on IncomingMessage

Add optional `fromSelf?: boolean` to `IncomingMessage` interface.

- External channels set this based on protocol-specific detection
- Web and CLI leave it `undefined` (not applicable — always owner)
- Policy layer reads it for Mode 1 resolution
- Orchestrator and runners do not need to know about it

## ChannelPolicyLayer

```typescript
class ChannelPolicyLayer implements ChannelAdapter {
  constructor(private inner: ChannelAdapter) {}

  async init(config, bus) {
    // read owner_id, owner_only from config
    // wrap bus: intercept publish() to apply owner gate
    await this.inner.init(config, wrappedBus)
  }

  async send(peerId, content) {
    // resolve __system__ → owner address
    // delegate to inner
  }

  // status, connectedAt, start, stop → delegate to inner
}
```

The policy layer is applied in `server.ts` / channel init — the orchestrator and bus
never see an unwrapped external channel adapter.

Web and CLI adapters are NOT wrapped — they are registered directly.

## Signal Fixes

**syncMessage self-destination filter**
Only process `syncMessage.sentMessage` where destination is the owner's own number
(note-to-self). Messages synced from "you sent to someone else" are dropped.

```
envelope.syncMessage.sentMessage
  destinationNumber === this._phoneNumber → process (note-to-self)
  destinationNumber !== this._phoneNumber → drop (sent to third party)
```

**Echo deduplication**
Signal REST API does not return a stable message ID on send. Use a content-hash
or timestamp+recipient key as a short-lived dedup token (TTL: 10 seconds).
Alternative: signal-cli may return a `timestamp` — investigate during implementation.

**send() status guard**
Mirror WhatsApp: `if (this._status !== 'connected') return;`

**Logging**
Add `[Signal] Received message ...` and `[Signal] Skipping empty ...` to match WA.

## Web Fix

```typescript
async send(peerId: string, content: MessageContent): Promise<void> {
  if (peerId === '__system__') {
    // broadcast to all registered peers
    await Promise.all([...this._senders.values()].map(fn => fn(content).catch(() => {})))
    return
  }
  // existing: lookup specific peer
}
```

## Contract Test Suite

```
tests/channels/contract/
  runContractTests.ts        shared suite for Tier 1
  runLiteContractTests.ts    shared suite for Tier 2

tests/channels/
  whatsapp.contract.test.ts  calls runContractTests with WA factory
  signal.contract.test.ts    calls runContractTests with Signal factory
  web.contract.test.ts       calls runLiteContractTests with Web factory
```

Channel factories receive mock transport (no real network). Tests exercise
the adapter through its public `ChannelAdapter` interface only.

## Risks and Mitigations

**Signal echo dedup without stable ID**
Signal REST API may not return a message ID. Mitigation: use a `timestamp+recipient`
composite key with 10-second TTL Set. Investigate during Task implementation.

**Policy layer wrapping breaks existing channel registry**
The registry returns raw adapters. Wrapping must happen after registry lookup,
in the server init path — not inside the channel itself. Registry stays clean.

**Web __system__ broadcast to disconnected senders**
If a WS client disconnects between registration and broadcast, `fn(content)` throws.
The `.catch(() => {})` per-sender silences this — same pattern as `broadcastToAllChannels`.

## Decisions Respected

- `trust` / `trusted_senders` capability system from channel-trust: untouched
- Pi as bundled dependency: unchanged
- Single-owner model: enforced at policy layer
