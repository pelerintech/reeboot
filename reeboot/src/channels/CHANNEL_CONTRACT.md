# Channel Adapter Contract

Every channel adapter in reeboot must satisfy the contract for its tier.
This file is the authoritative specification. The shared contract test suites
in `tests/channels/contract/` enforce every clause programmatically.

**When adding a new channel:** determine its tier, implement every clause for
that tier, and ensure `tests/channels/<name>.contract.test.ts` calls the
appropriate shared suite and passes before shipping.

**When modifying a channel:** re-run its contract test file to confirm no
regressions.

---

## Tier Classification

| Tier | Description | Examples |
|------|-------------|---------|
| **Tier 1** | External messaging channels — connect to third-party services, have real user identities, require policy enforcement | WhatsApp, Signal, Telegram, Slack, Discord |
| **Tier 2** | Local interface channels — run on the same machine as the agent, no external identity, always owner | Web (WebSocket), CLI |

The tier a channel belongs to must be documented in the adapter's file header.

---

## Tier 1 Contract — External Messaging Channels

These channels are wrapped in `ChannelPolicyLayer` by the registry automatically.
The policy layer handles `owner_id`, `owner_only`, and `__system__` resolution —
**channels must NOT implement these**.

### Inbound

- **Publish only non-empty messages.** Drop envelopes with no extractable text
  before publishing to the bus. Log skipped messages with `[ChannelName] Skipping empty ...`.

- **Set `fromSelf` on every published message.**
  - `fromSelf: true` when the message originates from the adapter's own account
    (e.g. WhatsApp `fromMe=true` self-chat, Signal `syncMessage.sentMessage` note-to-self).
  - `fromSelf: false` for all messages from third parties.
  - This field is used by `ChannelPolicyLayer` for Mode 1 owner resolution.

- **Deduplicate echoes.** Messages sent via `send()` that echo back through the
  transport must be suppressed before publishing to the bus. Track sent message IDs
  or content-keys with a short TTL (≤ 10 seconds). Do not publish an echo that was
  caused by the agent itself.

- **Log every received message** with `[ChannelName] Received message ...`.

### Outbound

- **`send()` must return silently (not throw) when `status()` is not `'connected'`.**
  Any message sent before the channel is fully connected is silently dropped.

- **Chunk messages** exceeding the protocol's character limit, with a delay between
  chunks to avoid rate limiting.

### Lifecycle

- **`init()` must transition `status()` to `'initializing'`.**

- **`status()` must reflect actual connection state.** Never set `'connected'`
  optimistically before the transport confirms the connection is open.

- **`stop()` must prevent reconnection** and clean up all timers, sockets, and
  pending retry handles. Calling `stop()` a second time must not throw.

- **`selfAddress()` must return the adapter's own address** on this channel
  (e.g. JID for WhatsApp, phone number for Signal) when connected, or `null`
  when not connected or not applicable. Used by `ChannelPolicyLayer` for Mode 1
  `__system__` resolution.

### Policy — MUST NOT be in the channel

The following concerns belong exclusively to `ChannelPolicyLayer`. A Tier 1 channel
that implements any of these has violated the contract:

- `owner_id` matching
- `owner_only` gating
- `trusted_senders` evaluation
- `__system__` sentinel resolution

---

## Tier 2 Contract — Local Interface Channels

These channels are NOT wrapped in `ChannelPolicyLayer`. All messages are
implicitly from the owner — no identity verification is required.

### Inbound

- No `fromSelf` required — all inbound messages are treated as owner by default.
- No echo deduplication required.

### Outbound

- **`send()` must return silently (not throw) when `status()` is not `'connected'`.**

- **`send('__system__', content)` must broadcast to ALL currently connected peers.**
  Errors from individual peer sends must be caught and silenced — one broken peer
  must not prevent delivery to the others.

- **`send()` with a specific peer ID that is not connected must return silently.**

### Lifecycle

- **`init()` must transition `status()` to `'initializing'`.**

- **`stop()` must transition `status()` to `'disconnected'`** and clean up all
  registered peer senders.

- **`selfAddress()` returns `null`** — Tier 2 channels have no meaningful
  self-address concept.

---

## Contract Test Suites

| Suite | Location | Use for |
|-------|----------|---------|
| `runChannelContractTests(factory)` | `tests/channels/contract/runContractTests.ts` | Tier 1 channels |
| `runLiteContractTests(factory)` | `tests/channels/contract/runLiteContractTests.ts` | Tier 2 channels |

Each channel must have a `tests/channels/<name>.contract.test.ts` that calls
the appropriate suite with a factory providing a mock/in-memory transport.
Factories may bypass internal transport handlers (e.g. calling `_handleIncomingMessage`
directly) when necessary — the factory is explicitly adapter-aware.

---

## Mode 1 vs Mode 2 Owner Identity

`ChannelPolicyLayer` resolves owner identity in two modes, driven by config:

```
owner_id absent  →  Mode 1 (self-chat)
                    Owner = messages where fromSelf === true
                    Used when agent runs on YOUR own account

owner_id present →  Mode 2 (dedicated account)
                    Owner = messages where peerId === owner_id
                    Used when agent runs on a separate account
```

Mode 3 (trusted_senders as allowlist) is planned but not yet implemented.
The architecture accommodates it: `ChannelPolicyLayer._gate()` is the single
place to add it.
